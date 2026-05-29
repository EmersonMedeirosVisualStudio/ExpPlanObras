function detectDelimiter(headerLine) {
    if ((headerLine.match(/;/g) || []).length >= (headerLine.match(/,/g) || []).length) {
        return ';';
    }
    return ',';
}
function splitCSVLine(line, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    result.push(current.trim());
    return result;
}
export function parseCSV(content) {
    const lines = content
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);
    if (lines.length === 0) {
        return { headers: [], rows: [] };
    }
    const delimiter = detectDelimiter(lines[0]);
    const rawHeaders = splitCSVLine(lines[0], delimiter).map(h => h.toLowerCase());
    const rows = [];
    for (let idx = 1; idx < lines.length; idx++) {
        const cols = splitCSVLine(lines[idx], delimiter);
        const row = {};
        for (let i = 0; i < rawHeaders.length; i++) {
            row[rawHeaders[i]] = (cols[i] ?? '').trim();
        }
        rows.push(row);
    }
    return { headers: rawHeaders, rows };
}
