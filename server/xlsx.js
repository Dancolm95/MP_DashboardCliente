import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { posix } from 'node:path';

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: false });
const many = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const valueText = value => typeof value === 'object' && value !== null ? String(value['#text'] ?? '') : String(value ?? '');
const richText = value => {
  if (typeof value === 'string') return value;
  if (value?.t !== undefined) return valueText(value.t);
  return many(value?.r).map(part => valueText(part.t)).join('');
};

export async function readWorkbook(buffer) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); }
  catch { throw new Error('El archivo no es un .xlsx válido.'); }
  const readXml = async path => {
    const entry = zip.file(path);
    if (!entry) throw new Error(`Falta ${path} en el Excel.`);
    if (entry._data?.uncompressedSize > 8_000_000) throw new Error('Una hoja del Excel es demasiado grande.');
    return xml.parse(await entry.async('string'));
  };
  const book = (await readXml('xl/workbook.xml')).workbook;
  const rels = (await readXml('xl/_rels/workbook.xml.rels')).Relationships;
  if (!book || !rels) throw new Error('No se pudo leer la estructura del Excel.');
  const paths = new Map(many(rels.Relationship).map(r => [r['@_Id'], r['@_Target']]));
  let shared = [];
  if (zip.file('xl/sharedStrings.xml')) {
    const strings = (await readXml('xl/sharedStrings.xml')).sst;
    shared = many(strings?.si).map(richText);
  }
  const sheets = new Map();
  for (const item of many(book.sheets?.sheet)) {
    const target = paths.get(item['@_id']);
    if (!target) throw new Error(`No se encontró la hoja ${item['@_name']}.`);
    const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('xl', target));
    if (!path.startsWith('xl/worksheets/')) throw new Error('Ruta de hoja no permitida.');
    const sheet = (await readXml(path)).worksheet;
    const rows = many(sheet?.sheetData?.row).map(row => {
      const cells = {};
      for (const cell of many(row.c)) {
        const column = String(cell['@_r'] || '').match(/^[A-Z]+/)?.[0];
        if (!column) continue;
        let value = cell.v;
        if (cell['@_t'] === 's') value = shared[Number(value)];
        else if (cell['@_t'] === 'inlineStr') value = richText(cell.is);
        else if (value !== undefined && value !== '' && cell['@_t'] !== 'str' && cell['@_t'] !== 'e') value = Number(value);
        cells[column] = value ?? '';
      }
      return { number: Number(row['@_r']), cells };
    }).filter(row => Object.values(row.cells).some(value => value !== ''));
    sheets.set(item['@_name'], rows);
  }
  return sheets;
}
