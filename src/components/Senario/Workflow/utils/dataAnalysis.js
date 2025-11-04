/* analyzeDatasetStructure.js */
import Papa from 'papaparse';
import _ from 'lodash';

/* ---------- helpers ---------- */
const readContent = (fileOrText) =>
    typeof fileOrText === 'string'
        ? Promise.resolve(fileOrText)
        : new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = (e) => res(e.target.result);
            r.onerror = rej;
            r.readAsText(fileOrText);
        });

const median = (nums) => {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/* ---------- main ---------- */
export const analyzeDatasetStructure = async (fileOrText, options = {}) => {
    try {
        const content = await readContent(fileOrText);
        if (!content) throw new Error('Empty file content');

        const parsed = Papa.parse(content, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            delimitersToGuess: [',', ';', '\t', '|'],
            ...options,
        });

        const data = parsed.data ?? [];
        const columns = parsed.meta?.fields ?? [];
        if (!columns.length) throw new Error('No header detected');

        const stats = {};
        const numericColumns = [];
        const categoricalColumns = [];
        const dateColumns = [];
        const missingValueSummary = {};
        const uniqueValueCounts = {};

        columns.forEach((col) => {
            const colVals = data
                .map((r) => r[col])
                .filter((v) => v !== null && v !== undefined && v !== '');
            const numVals = colVals.filter(
                (v) => typeof v === 'number' && !Number.isNaN(v)
            );
            const uniqVals = _.uniq(colVals);

            const stat = {
                count: colVals.length,
                empty: data.length - colVals.length,
                unique: uniqVals.length,
                topValues: uniqVals.slice(0, 5),
            };

            if (numVals.length && numVals.length === colVals.length) {
                Object.assign(stat, {
                    dataType: 'numeric',
                    min: _.min(numVals),
                    max: _.max(numVals),
                    sum: _.sum(numVals),
                    avg: _.sum(numVals) / numVals.length,
                    median: median(numVals),
                });
                numericColumns.push(col);
            } else if (
                colVals.length &&
                colVals.every((v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)))
            ) {
                stat.dataType = 'date';
                dateColumns.push(col);
            } else {
                stat.dataType = 'categorical';
                categoricalColumns.push(col);
            }

            stats[col] = stat;
            missingValueSummary[col] = stat.empty;
            uniqueValueCounts[col] = stat.unique;
        });

        const metadata = {
            rowCount: data.length,
            columnCount: columns.length,
            numericColumns,
            categoricalColumns,
            dateColumns,
            missingValueSummary,
            uniqueValueCounts,
            stats, // ← 统计信息已放入 metadata
        };

        return { columns, metadata };
    } catch (err) {
        console.error('Error analyzing dataset structure:', err);
        return null;
    }
};
