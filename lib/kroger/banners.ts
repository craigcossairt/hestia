// Kroger family banner sites. Each banner brand has its own customer
// website + cart URL, even though they all share the same backend
// /v1/cart API. When the user adds items to cart and clicks "view
// cart", we want to open THEIR store's site — Smith's shoppers see
// smithsfoodanddrug.com, Fry's shoppers see frysfood.com, etc.
//
// Mapping is from the `chain` field in Kroger's /locations response.
// Codes are uppercase, no spaces. Anything not in the list defaults to
// kroger.com — the cart still works, the URL is just generic.

const BANNER_HOSTS: Record<string, string> = {
  KROGER: "kroger.com",
  SMITHS: "smithsfoodanddrug.com",
  FRYS: "frysfood.com",
  "KING SOOPERS": "kingsoopers.com",
  KINGSOOPERS: "kingsoopers.com",
  "CITY MARKET": "citymarket.com",
  CITYMARKET: "citymarket.com",
  DILLONS: "dillons.com",
  "FOOD 4 LESS": "food4less.com",
  FOOD4LESS: "food4less.com",
  "FOODS CO": "foodsco.net",
  FOODSCO: "foodsco.net",
  "FRED MEYER": "fredmeyer.com",
  FREDMEYER: "fredmeyer.com",
  "HARRIS TEETER": "harristeeter.com",
  HARRISTEETER: "harristeeter.com",
  "JAY C": "jaycfoods.com",
  JAYC: "jaycfoods.com",
  MARIANOS: "marianos.com",
  "MARIANO'S": "marianos.com",
  "METRO MARKET": "metromarket.net",
  METROMARKET: "metromarket.net",
  OWENS: "owensmarket.com",
  "OWEN'S": "owensmarket.com",
  PAYLESS: "payless-supermarkets.com",
  "PAY-LESS": "payless-supermarkets.com",
  "PICK 'N SAVE": "picknsave.com",
  "PICK N SAVE": "picknsave.com",
  PICKNSAVE: "picknsave.com",
  QFC: "qfc.com",
  RALPHS: "ralphs.com",
  RULER: "rulerfoods.com",
};

export function bannerHostForChain(chain: string | null | undefined): string {
  if (!chain) return "kroger.com";
  const key = chain.trim().toUpperCase();
  return BANNER_HOSTS[key] ?? "kroger.com";
}

// Convenience: full cart URL for the banner the user shops at.
export function bannerCartUrl(chain: string | null | undefined): string {
  return `https://www.${bannerHostForChain(chain)}/cart`;
}

// The friendly display name for a chain. Useful when we want to say
// "Open cart on smithsfoodanddrug.com" without leaking the all-caps
// API code.
export function bannerDisplayHost(chain: string | null | undefined): string {
  return bannerHostForChain(chain);
}
