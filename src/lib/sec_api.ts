import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

// As per SEC guidelines, a custom User-Agent is required.
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'PocketFlow/1.0 (bhatt.ayush.1998@gmail.com)'
    }
});

export interface Filing {
    accessionNumber: string;
    filingDate: string;
    reportDate: string;
    form: string;
    primaryDocument: string;
    url: string;
    fullText: string;
}

export interface CompanyInfo {
    cik: string;
    ticker: string;
    title: string;
}

interface CompanyData {
    filings: {
        recent: {
            accessionNumber: string[];
            filingDate: string[];
            reportDate: string[];
            form: string[];
            primaryDocument: string[];
            [key: string]: unknown;
        };
    };
    [key: string]: unknown;
}

// Helper function to get the quarters within a date range
function getQuartersInRange(startDate: string, endDate: string): { year: number, quarter: number }[] {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    const quarters = [];

    let year = start.getUTCFullYear();
    let quarter = Math.floor(start.getUTCMonth() / 3) + 1;

    const endYear = end.getUTCFullYear();
    const endQuarter = Math.floor(end.getUTCMonth() / 3) + 1;

    while (year < endYear || (year === endYear && quarter <= endQuarter)) {
        quarters.push({ year, quarter });

        quarter++;
        if (quarter > 4) {
            quarter = 1;
            year++;
        }
    }

    return quarters;
}


async function getCompanyTickers(): Promise<Record<string, { cik_str: number; ticker: string; title: string }>> {
    const url = 'https://www.sec.gov/files/company_tickers.json';
    const response = await axiosInstance.get(url);
    return response.data;
}

export async function findCik(identifier: string): Promise<CompanyInfo[]> {
    const companies = await getCompanyTickers();
    const lowerCaseIdentifier = identifier.toLowerCase();
    const results: CompanyInfo[] = [];

    // First, check for an exact ticker match for high confidence
    for (const key in companies) {
        const company = companies[key];
        if (company.ticker.toLowerCase() === lowerCaseIdentifier) {
            return [{ 
                cik: company.cik_str.toString(),
                ticker: company.ticker,
                title: company.title 
            }];
        }
    }

    // If no exact ticker, search titles for partial matches
    for (const key in companies) {
        const company = companies[key];
        if (company.title.toLowerCase().includes(lowerCaseIdentifier)) {
            results.push({
                cik: company.cik_str.toString(),
                ticker: company.ticker,
                title: company.title
            });
        }
    }
    
    if (results.length === 0) {
        throw new Error(`CIK not found for identifier: ${identifier}`);
    }

    return results;
}

function padCik(cik: string): string {
    return cik.padStart(10, '0');
}

async function fetchFilingContent(url: string): Promise<string> {
    try {
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);
        
        $('script, style, noscript, meta, link, nav, header, footer').remove();
        $('img, input, button').remove(); 
        $('[style*="display:none"], [style*="display: none"]').remove(); 
        
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            emDelimiter: '*'
        });
        
        turndownService.addRule('betterTables', {
            filter: 'table',
            replacement: function(content, node) {
                const table = node as HTMLTableElement;
                let result = '\n\n**TABLE:**\n\n';
                const rows = Array.from(table.querySelectorAll('tr'));
                let hasValidContent = false;
                
                rows.forEach((row) => {
                    const cells = Array.from(row.querySelectorAll('td, th'));
                    const cellTexts = cells.map(cell => {
                        const text = cell.textContent?.trim() || '';
                        return text.replace(/\s+/g, ' ');
                    }).filter(text => text.length > 0);
                    
                    if (cellTexts.length > 0) {
                        hasValidContent = true;
                        if (row.querySelector('th')) {
                            result += `**${cellTexts.join(' | ')}**\n`;
                        } else {
                            result += `${cellTexts.join(' | ')}\n`;
                        }
                    }
                });
                
                return hasValidContent ? result + '\n' : '';
            }
        });
        
        turndownService.addRule('cleanLists', {
            filter: ['ul', 'ol'],
            replacement: function(content, node) {
                const element = node as HTMLElement;
                const listItems = Array.from(element.querySelectorAll('li'));
                if (listItems.length === 0) return '';
                
                let result = '\n\n';
                listItems.forEach((li, index) => {
                    const text = li.textContent?.trim();
                    if (text) {
                        const prefix = element.tagName.toLowerCase() === 'ol' ? `${index + 1}. ` : '- ';
                        result += `${prefix}${text}\n`;
                    }
                });
                return result + '\n';
            }
        });
        
        const htmlContent = $('body').html() || '';
        let markdownContent = turndownService.turndown(htmlContent);
        
        markdownContent = markdownContent
            .replace(/\|\s*\|\s*\|\s*\|/g, '')
            .replace(/\|\s*---\s*\|\s*---\s*\|/g, '')
            .replace(/\n\s*\n\s*\n+/g, '\n\n')
            .replace(/^#+\s*$/gm, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/^\s*\|\s*$/gm, '')
            .trim();
        
        return markdownContent;
            
    } catch (error) {
        console.error(`Error fetching filing content from ${url}:`, error);
        return 'Error: Unable to fetch filing content';
    }
}

export async function getCompanyData(cik: string): Promise<CompanyData> {
    const paddedCik = padCik(cik);
    const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

    try {
        const response = await axiosInstance.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching data for CIK ${cik}:`, error);
        throw error;
    }
}

export async function getRecentFilings(cik: string, formType: string, limit: number = 10): Promise<Filing[]> {
    const companyData = await getCompanyData(cik);
    const recentFilings = companyData.filings.recent;
    const filings: Filing[] = [];
    let foundCount = 0;

    for (let i = 0; i < recentFilings.accessionNumber.length && foundCount < limit; i++) {
        if (recentFilings.form[i] === formType) {
            const accessionNum = recentFilings.accessionNumber[i].replace(/-/g, '');
            const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNum}/${recentFilings.primaryDocument[i]}`;
            
            const filing: Filing = {
                accessionNumber: recentFilings.accessionNumber[i],
                filingDate: recentFilings.filingDate[i],
                reportDate: recentFilings.reportDate[i],
                form: recentFilings.form[i],
                primaryDocument: recentFilings.primaryDocument[i],
                url: url,
                fullText: await fetchFilingContent(url)
            };
            filings.push(filing);
            foundCount++;
        }
    }
    return filings;
}

export async function getFilingsByDateRange(cik: string, formType: string, startDate: string, endDate: string): Promise<Filing[]> {
    const quarters = getQuartersInRange(startDate, endDate);
    const filings: Filing[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (const { year, quarter } of quarters) {
        const url = `https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${quarter}/master.idx`;
        try {
            const response = await axiosInstance.get(url, { responseType: 'text' });
            const lines = response.data.split('\n');
            const dataLines = lines.slice(11); // Skip header lines

            for (const line of dataLines) {
                const parts = line.split('|');
                if (parts.length < 5) continue;

                const lineCik = parts[0].trim();
                const lineFormType = parts[2].trim();
                const lineFilingDate = parts[3].trim();
                const filingDate = new Date(lineFilingDate);

                if (lineCik === cik && lineFormType === formType && filingDate >= start && filingDate <= end) {
                    const docUrl = `https://www.sec.gov/Archives/${parts[4].trim()}`;
                    const accessionNumber = parts[4].split('/').pop()?.replace('.txt', '').replace(/-/g, '');
                    
                    // Get the actual report date by fetching company data and finding this filing
                    let reportDate = lineFilingDate; // Default to filing date if not found
                    try {
                        const companyData = await getCompanyData(cik);
                        const recentFilings = companyData.filings.recent;
                        const filingIndex = recentFilings.accessionNumber.findIndex(acc => 
                            acc.replace(/-/g, '') === accessionNumber
                        );
                        if (filingIndex !== -1) {
                            reportDate = recentFilings.reportDate[filingIndex];
                        }
                    } catch {
                        console.warn(`Could not fetch report date for ${accessionNumber}, using filing date`);
                    }
                    
                    const filing: Filing = {
                        accessionNumber: accessionNumber || 'N/A',
                        filingDate: lineFilingDate,
                        reportDate: reportDate,
                        form: lineFormType,
                        primaryDocument: docUrl.split('/').pop() || 'N/A',
                        url: docUrl,
                        fullText: await fetchFilingContent(docUrl)
                    };
                    filings.push(filing);
                }
            }
        } catch (error) {
            console.warn(`Could not fetch or process index for ${year}-QTR${quarter}:`, error);
        }
    }
    return filings;
}
