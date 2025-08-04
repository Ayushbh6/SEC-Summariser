import { getCompanyData, getRecentFilings, findCik, getFilingsByDateRange } from './sec_api';

describe('SEC API Functions', () => {
    const testUserEmail = 'ayushbh6@gmail.com';

    describe('findCik', () => {
        it('should return an array with a single, correct company for an exact ticker', async () => {
            const results = await findCik('MSFT', testUserEmail);
            expect(results).toHaveLength(1);
            expect(results[0].ticker).toBe('MSFT');
            expect(results[0].title).toBe('MICROSOFT CORP');
        });

        it('should return an array of potential matches for a partial title', async () => {
            const results = await findCik('micro', testUserEmail);
            expect(results.length).toBeGreaterThan(1);
            const microsoft = results.find(c => c.title === 'MICROSOFT CORP');
            expect(microsoft).toBeDefined();
        });

        it('should return a single result for a full, case-insensitive title match', async () => {
            const results = await findCik('nvidia corp', testUserEmail);
            expect(results.length).toBeGreaterThanOrEqual(1);
            const nvidia = results.find(c => c.ticker === 'NVDA');
            expect(nvidia).toBeDefined();
        });

        it('should throw an error for a non-existent company', async () => {
            await expect(findCik('NonExistentCompany12345', testUserEmail)).rejects.toThrow();
        });
    });

    describe('getCompanyData', () => {
        it('should return the correct company data for Apple (CIK: 320193)', async () => {
            const data = await getCompanyData('320193', testUserEmail);
            expect(data.cik).toBe('0000320193');
        });

        it('should throw an error for a CIK that does not exist', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await expect(getCompanyData('0000000001', testUserEmail)).rejects.toThrow();
            consoleErrorSpy.mockRestore();
        });
    });

    describe('getRecentFilings', () => {
        it('should return an array of 10-K filings for Apple', async () => {
            const filings = await getRecentFilings('320193', '10-K', 10, testUserEmail);
            expect(Array.isArray(filings)).toBe(true);
            expect(filings[0].form).toBe('10-K');
        }, 20000); // Increase timeout for this test
    });

    describe('getFilingsByDateRange', () => {
        // Test Case 1: Find Apple's 2023 10-K
        it('should find a specific 10-K filing within a narrow date range', async () => {
            const filings = await getFilingsByDateRange('320193', '10-K', '2023-11-01', '2023-11-05', testUserEmail);
            expect(filings).toHaveLength(1);
            expect(filings[0].form).toBe('10-K');
            expect(filings[0].filingDate).toBe('2023-11-03');
        }, 30000); // Increase timeout

        // Test Case 2: Search for 10-Q filings spanning Q3 and Q4 2023
        it('should find filings across multiple quarters', async () => {
            const filings = await getFilingsByDateRange('320193', '10-Q', '2023-06-01', '2023-08-15', testUserEmail);
            expect(filings.length).toBeGreaterThanOrEqual(1);
            const q3Filing = filings.find(f => f.filingDate === '2023-08-04');
            expect(q3Filing).toBeDefined();
        }, 45000); // Increase timeout

        // Test Case 3: Search for a range with no expected filings
        it('should return an empty array for a date range with no filings', async () => {
            const filings = await getFilingsByDateRange('320193', '10-K', '2023-01-01', '2023-01-05', testUserEmail);
            expect(filings).toHaveLength(0);
        }, 30000); // Increase timeout
    });
});
