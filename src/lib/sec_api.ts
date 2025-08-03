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

async function getCompanyTickers(): Promise<any> {
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
        
        // Remove non-content elements
        $('script, style, noscript, meta, link, nav, header, footer').remove();
        
        // SEC-specific cleanup
        $('img, input, button').remove(); // Remove images and form elements
        $('[style*="display:none"], [style*="display: none"]').remove(); // Hidden elements
        
        // Configure turndown with SEC-optimized settings
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            emDelimiter: '*'
        });
        
        // Custom rule for better table handling
        turndownService.addRule('betterTables', {
            filter: 'table',
            replacement: function(content, node) {
                const table = node as HTMLTableElement;
                let result = '\n\n**TABLE:**\n\n';
                
                const rows = Array.from(table.querySelectorAll('tr'));
                let hasValidContent = false;
                
                rows.forEach((row, rowIndex) => {
                    const cells = Array.from(row.querySelectorAll('td, th'));
                    const cellTexts = cells.map(cell => {
                        const text = cell.textContent?.trim() || '';
                        return text.replace(/\s+/g, ' '); // Normalize whitespace
                    }).filter(text => text.length > 0); // Remove empty cells
                    
                    if (cellTexts.length > 0) {
                        hasValidContent = true;
                        // Use different formatting for headers vs data rows
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
        
        // Custom rule for better list handling
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
        
        // Process the content
        const htmlContent = $('body').html() || '';
        let markdownContent = turndownService.turndown(htmlContent);
        
        // SEC-specific post-processing cleanup
        markdownContent = markdownContent
            // Remove excessive empty markdown table syntax
            .replace(/\|\s*\|\s*\|\s*\|/g, '')
            .replace(/\|\s*---\s*\|\s*---\s*\|/g, '')
            // Clean up multiple empty lines
            .replace(/\n\s*\n\s*\n+/g, '\n\n')
            // Remove empty headers
            .replace(/^#+\s*$/gm, '')
            // Clean up excessive spacing
            .replace(/[ \t]+/g, ' ')
            .replace(/\n[ \t]+/g, '\n')
            // Remove standalone | characters
            .replace(/^\s*\|\s*$/gm, '')
            .trim();
        
        return markdownContent;
            
    } catch (error) {
        console.error(`Error fetching filing content from ${url}:`, error);
        return 'Error: Unable to fetch filing content';
    }
}

export async function getCompanyData(cik: string): Promise<any> {
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

    // First, filter by form type and limit BEFORE fetching content
    let foundCount = 0;
    for (let i = 0; i < recentFilings.accessionNumber.length && foundCount < limit; i++) {
        // Only process if it matches the form type we want
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
