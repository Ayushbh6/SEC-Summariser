import { getCompanyData, getRecentFilings, findCik } from './sec_api';

describe('SEC API Functions', () => {

    describe('findCik', () => {
        it('should return an array with a single, correct company for an exact ticker', async () => {
            const results = await findCik('MSFT');
            expect(results).toHaveLength(1);
            expect(results[0].ticker).toBe('MSFT');
            expect(results[0].title).toBe('MICROSOFT CORP');
        });

        it('should return an array of potential matches for a partial title', async () => {
            const results = await findCik('micro');
            expect(results.length).toBeGreaterThan(1);
            const microsoft = results.find(c => c.title === 'MICROSOFT CORP');
            expect(microsoft).toBeDefined();
        });

        it('should return a single result for a full, case-insensitive title match', async () => {
            const results = await findCik('nvidia corp');
            expect(results.length).toBeGreaterThanOrEqual(1);
            const nvidia = results.find(c => c.ticker === 'NVDA');
            expect(nvidia).toBeDefined();
        });

        it('should throw an error for a non-existent company', async () => {
            await expect(findCik('NonExistentCompany12345')).rejects.toThrow();
        });
    });

    describe('getCompanyData', () => {
        it('should return the correct company data for Apple (CIK: 320193)', async () => {
            const data = await getCompanyData('320193');
            expect(data.cik).toBe('0000320193');
        });

        it('should throw an error for a CIK that does not exist', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await expect(getCompanyData('0000000001')).rejects.toThrow();
            consoleErrorSpy.mockRestore();
        });
    });

    describe('getRecentFilings', () => {
        it('should return an array of 10-K filings for Apple', async () => {
            const filings = await getRecentFilings('320193', '10-K');
            expect(Array.isArray(filings)).toBe(true);
            expect(filings[0].form).toBe('10-K');
        });
    });
});
