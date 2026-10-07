/**
 * THE VIEWER'S OWN CURRENCY — from where their clock says they are, never from a country
 * the product names.
 *
 * A browser's language is often "en-US" on a phone in Lahore or Lagos; its time zone is not.
 * So the zone decides, with the language's region as the fallback, and a dollar viewer sees
 * dollars only. The table covers the zones where most of the world's online workers live;
 * a zone not on it simply shows no second amount, which is honest, rather than a guess.
 */

const ZONES: Readonly<Record<string, string>> = {
  // South and Southeast Asia
  "Asia/Karachi": "PKR",
  "Asia/Kolkata": "INR",
  "Asia/Calcutta": "INR",
  "Asia/Dhaka": "BDT",
  "Asia/Kathmandu": "NPR",
  "Asia/Colombo": "LKR",
  "Asia/Manila": "PHP",
  "Asia/Jakarta": "IDR",
  "Asia/Makassar": "IDR",
  "Asia/Ho_Chi_Minh": "VND",
  "Asia/Saigon": "VND",
  "Asia/Bangkok": "THB",
  "Asia/Kuala_Lumpur": "MYR",
  "Asia/Singapore": "SGD",
  "Asia/Yangon": "MMK",
  // East Asia
  "Asia/Tokyo": "JPY",
  "Asia/Seoul": "KRW",
  "Asia/Shanghai": "CNY",
  "Asia/Hong_Kong": "HKD",
  "Asia/Taipei": "TWD",
  // Middle East and Central Asia
  "Asia/Dubai": "AED",
  "Asia/Riyadh": "SAR",
  "Asia/Qatar": "QAR",
  "Asia/Kuwait": "KWD",
  "Asia/Bahrain": "BHD",
  "Asia/Muscat": "OMR",
  "Asia/Amman": "JOD",
  "Asia/Beirut": "LBP",
  "Asia/Jerusalem": "ILS",
  "Asia/Tel_Aviv": "ILS",
  "Asia/Baghdad": "IQD",
  "Asia/Tashkent": "UZS",
  "Asia/Almaty": "KZT",
  "Asia/Tbilisi": "GEL",
  "Asia/Yerevan": "AMD",
  "Asia/Baku": "AZN",
  "Europe/Istanbul": "TRY",
  // Africa
  "Africa/Lagos": "NGN",
  "Africa/Nairobi": "KES",
  "Africa/Accra": "GHS",
  "Africa/Cairo": "EGP",
  "Africa/Johannesburg": "ZAR",
  "Africa/Casablanca": "MAD",
  "Africa/Algiers": "DZD",
  "Africa/Tunis": "TND",
  "Africa/Addis_Ababa": "ETB",
  "Africa/Kampala": "UGX",
  "Africa/Dar_es_Salaam": "TZS",
  "Africa/Kigali": "RWF",
  "Africa/Lusaka": "ZMW",
  "Africa/Harare": "USD",
  "Africa/Douala": "XAF",
  "Africa/Abidjan": "XOF",
  "Africa/Dakar": "XOF",
  // Europe
  "Europe/London": "GBP",
  "Europe/Dublin": "EUR",
  "Europe/Lisbon": "EUR",
  "Europe/Madrid": "EUR",
  "Europe/Paris": "EUR",
  "Europe/Brussels": "EUR",
  "Europe/Amsterdam": "EUR",
  "Europe/Luxembourg": "EUR",
  "Europe/Berlin": "EUR",
  "Europe/Vienna": "EUR",
  "Europe/Rome": "EUR",
  "Europe/Athens": "EUR",
  "Europe/Helsinki": "EUR",
  "Europe/Tallinn": "EUR",
  "Europe/Riga": "EUR",
  "Europe/Vilnius": "EUR",
  "Europe/Bratislava": "EUR",
  "Europe/Ljubljana": "EUR",
  "Europe/Zagreb": "EUR",
  "Europe/Malta": "EUR",
  "Asia/Nicosia": "EUR",
  "Europe/Zurich": "CHF",
  "Europe/Oslo": "NOK",
  "Europe/Stockholm": "SEK",
  "Europe/Copenhagen": "DKK",
  "Europe/Warsaw": "PLN",
  "Europe/Prague": "CZK",
  "Europe/Budapest": "HUF",
  "Europe/Bucharest": "RON",
  "Europe/Sofia": "BGN",
  "Europe/Belgrade": "RSD",
  "Europe/Kyiv": "UAH",
  "Europe/Kiev": "UAH",
  "Europe/Chisinau": "MDL",
  // The Americas
  "America/New_York": "USD",
  "America/Chicago": "USD",
  "America/Denver": "USD",
  "America/Los_Angeles": "USD",
  "America/Phoenix": "USD",
  "America/Anchorage": "USD",
  "Pacific/Honolulu": "USD",
  "America/Toronto": "CAD",
  "America/Vancouver": "CAD",
  "America/Edmonton": "CAD",
  "America/Winnipeg": "CAD",
  "America/Halifax": "CAD",
  "America/Mexico_City": "MXN",
  "America/Monterrey": "MXN",
  "America/Tijuana": "MXN",
  "America/Bogota": "COP",
  "America/Lima": "PEN",
  "America/Santiago": "CLP",
  "America/Sao_Paulo": "BRL",
  "America/Argentina/Buenos_Aires": "ARS",
  "America/Buenos_Aires": "ARS",
  "America/Caracas": "VES",
  "America/Guayaquil": "USD",
  "America/Panama": "USD",
  "America/El_Salvador": "USD",
  "America/Montevideo": "UYU",
  "America/Asuncion": "PYG",
  "America/La_Paz": "BOB",
  "America/Guatemala": "GTQ",
  "America/Costa_Rica": "CRC",
  "America/Santo_Domingo": "DOP",
  "America/Puerto_Rico": "USD",
  "America/Jamaica": "JMD",
  // Oceania
  "Australia/Sydney": "AUD",
  "Australia/Melbourne": "AUD",
  "Australia/Brisbane": "AUD",
  "Australia/Perth": "AUD",
  "Australia/Adelaide": "AUD",
  "Pacific/Auckland": "NZD",
};

/** A language region's currency, for a browser whose zone is not on the table. */
const REGIONS: Readonly<Record<string, string>> = {
  PK: "PKR", IN: "INR", BD: "BDT", NP: "NPR", LK: "LKR", PH: "PHP", ID: "IDR", VN: "VND", TH: "THB", MY: "MYR", SG: "SGD",
  JP: "JPY", KR: "KRW", CN: "CNY", HK: "HKD", TW: "TWD", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", TR: "TRY", EG: "EGP",
  NG: "NGN", KE: "KES", GH: "GHS", ZA: "ZAR", MA: "MAD", GB: "GBP", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
  PT: "EUR", IE: "EUR", BE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  CZ: "CZK", HU: "HUF", RO: "RON", UA: "UAH", US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CO: "COP", PE: "PEN",
  CL: "CLP", AU: "AUD", NZ: "NZD",
};

/** The viewer's currency, or null when it cannot be told. USD means "show nothing extra". */
export function currencyFor(timeZone: string | undefined, languages: readonly string[]): string | null {
  if (timeZone && ZONES[timeZone]) return ZONES[timeZone]!;
  for (const lang of languages) {
    const region = /-([A-Z]{2})\b/.exec(lang)?.[1];
    if (region && REGIONS[region]) return REGIONS[region]!;
  }
  return null;
}
