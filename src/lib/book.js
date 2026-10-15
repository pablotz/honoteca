// Helpers puros de presentación/normalización (sin DOM). Portados 1:1 del cliente viejo.
import { t } from './i18n.js';
// El crudo se guarda (procedencia); lo que se VE va normalizado (§5).

export const displayTitle = (b) =>
  (b.title_native || b.title_romaji || `ISBN ${fmtIsbn(b.isbn)}`).normalize('NFKC').replace(/\s+/g, ' ').trim();

export function displayAuthor(b) {
  const a = b.authors && b.authors[0];
  return a ? normalizeAuthor(a) : '';
}

// openbd: "夏目,漱石,1867-1916" → "夏目漱石"  |  "Boswell,Dustin,1976-" → "Dustin Boswell"
export function normalizeAuthor(a) {
  const parts = String(a).normalize('NFKC').replace(/\s+/g, ' ').split(',').map((s) => s.trim()).filter((s) => s && !/^\d{4}(-\d{0,4})?$/.test(s));
  if (parts.length >= 2 && /^[A-Za-z]/.test(parts[0])) return `${parts.slice(1).join(' ')} ${parts[0]}`.trim();
  return parts.join('');
}

// ISBN tal cual (sin guiones): el agrupado real depende del país de registro y no se puede
// adivinar por posición — inventarlo daba cosas como «978-6-073-1982-88».
export function fmtIsbn(isbn) {
  const d = String(isbn || '').replace(/[^0-9Xx]/g, '');
  return d || '—';
}

// dígito de control: EAN-13 (mod-10) e ISBN-10 (mod-11, X = 10). Un ISBN que no lo
// pasa es una captura/lectura corrupta — buscarlo es tirar la búsqueda.
export function validIsbn(t) {
  const d = String(t || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (d.length === 13) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += +d[i] * (i % 2 === 0 ? 1 : 3);
    return (10 - (s % 10)) % 10 === +d[12];
  }
  if (d.length === 10) {
    let s = 0;
    for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
    const c = (11 - (s % 11)) % 11;
    return c === 10 ? 'X' === d[9] : c === +d[9];
  }
  return false;
}

const HISP_PUB = /planeta|debolsillo|alfaguara|anagrama|urano|diana|paid[oó]s|salamandra|tusquets|seix barral|fondo de cultura|fce|grijalbo|aguilar|alianza|c[aá]tedra|siruela|acantilado|impedimenta|sexto piso|era|porr[uú]a|joaqu[ií]n mortiz|oc[eé]ano|minotauro|ediciones b|roca|espasa|austral|punto de lectura|suma|taurus|debate|cr[ií]tica|ariel|lum[eé]n|almad[ií]a|p[aá]gina ind[oó]mita|herder|kair[oó]s|mirlo|selector|trillas|siglo xxi|gedisa|trotta|akal|sirio|obelisco|conecta|empresa activa|booket|editorial|ediciones|grupo editorial|m[eé]xico|espa[ñn]a/i;
const ENG_PUB = /\b(penguin|vintage|random house|harper(?:collins)?|simon & schuster|macmillan|farrar|st\.?\s*martin|hachette|bloomsbury|faber|oxford|cambridge|allen lane|hamish hamilton|sceptre|picador|panther|bantam|crown|scribner|viking|riverhead|little,\s*brown|mariner|norton|grove|routledge|wiley|o'reilly|no starch|pragmatic|manning|apress|packt|addison-wesley|mit press|princeton|yale|harvard|knopf|doubleday|tor|orbit|gollancz|hodder|transworld|chatto|jonathan cape|fourth estate|profile books|granta|atlantic books|canongate)\b/i;
const HISP_ISBN = /^(97884|978607|978950|978958|978968|978970|978987|978956|9789972|978612|9789974|978980|84)/;
const EN_WORDS = /\b(the|and|with|from|that|this|his|her|their|about|into|through|while|world|book|life|story|author|readers|years|written|between|after|before|where|which|would|could|should|have|has|had|been|were|they|them|what|when)\b/gi;
const ES_WORDS = /\b(que|los|las|del|una|para|con|por|como|más|pero|sus|esta|este|entre|sobre|vida|libro|historia|mundo|autor|obra|cuando|todo|también|hasta|donde|quien|desde|nos|uno|son|fue|era|hay|sin)\b/gi;

export function isEnglishText(text) {
  const s = String(text || '').replace(/<[^>]+>/g, ' ').trim();
  if (!s) return false;
  const en = (s.match(EN_WORDS) || []).length;
  const es = (s.match(ES_WORDS) || []).length + (s.match(/[áéíóúñ¿¡]/gi) || []).length;
  return en >= 3 && en > es * 1.3;
}

export function isEnglishPublisher(publisher, isbn) {
  const pub = String(publisher || '').trim();
  const clean = String(isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (clean && HISP_ISBN.test(clean)) return false;
  if (pub && HISP_PUB.test(pub)) return false;
  if (pub && ENG_PUB.test(pub)) return true;
  return false;
}

// Sinopsis HTML de la fuente → texto plano legible.
// Regla de idioma: sinopsis en inglés SOLO cuando la editorial es inglesa.
export function blurbText(text, book) {
  const clean = String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
  if (clean && book && isEnglishText(clean) && !isEnglishPublisher(book.publisher, book.isbn)) {
    return null;
  }
  return clean;
}

export const locText = (l) => `${l.shelf} · ${t('fila', 'row')} ${l.row} · ${l.pos}${t('.º', '')}`;
