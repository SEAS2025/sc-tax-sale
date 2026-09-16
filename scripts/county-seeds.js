"use strict";

/**
 * Official county websites copied from the SC Association of Counties
 * directory on 16 September 2026:
 * https://www.sccounties.org/county-information
 *
 * These are homepages, not guessed /delinquent-tax paths. Extra starts are
 * treasurer URLs already verified in scripts/build-registry.js.
 */

const SEEDS = {
  abbeville: ["https://abbevillecountysc.com"],
  aiken: ["http://www.aikencountysc.gov"],
  allendale: ["https://www.allendalecounty.com"],
  anderson: ["https://www.andersoncountysc.org"],
  bamberg: [
    "https://www.bambergcounty.sc.gov",
    "https://www.bambergcounty.sc.gov/tax-services/delinquent-tax-office/delinquent-tax-properties",
  ],
  barnwell: ["https://www.barnwellcountysc.us"],
  beaufort: [
    "https://www.beaufortcountysc.gov",
    "https://www.beaufortcountytreasurer.com/research-and-data",
  ],
  berkeley: ["https://www.berkeleycountysc.gov"],
  calhoun: ["https://calhouncounty.sc.gov"],
  charleston: [
    "https://www.charlestoncounty.org",
    "https://www.charlestoncounty.gov/departments/delinquent-tax/tax-sale.php",
  ],
  cherokee: ["https://www.cherokeecountysc.gov"],
  chester: ["https://www.chestercountysc.gov"],
  chesterfield: ["http://www.chesterfieldcountysc.com"],
  clarendon: ["http://www.clarendoncountygov.org"],
  colleton: ["http://www.colletoncounty.org"],
  darlington: ["http://www.darcosc.com"],
  dillon: ["https://www.dilloncountysc.org"],
  dorchester: [
    "https://www.dorchestercountysc.gov/",
    "https://www.dorchestercountysc.gov/government/property-tax-services/delinquent-tax",
  ],
  edgefield: ["https://edgefieldcounty.sc.gov/"],
  fairfield: ["https://www.fairfieldsc.com/"],
  florence: ["http://www.florenceco.org"],
  georgetown: ["http://www.gtcountysc.gov"],
  greenville: [
    "https://www.greenvillecounty.org",
    "https://www.greenvillecounty.org/appsAS400/Taxsale/",
  ],
  greenwood: ["https://www.greenwoodcounty-sc.gov/"],
  hampton: ["http://www.hamptoncountysc.org"],
  horry: [
    "https://www.horrycountysc.gov",
    "https://www.horrycountysc.gov/departments/treasurer/delinquent-tax/",
  ],
  jasper: ["https://www.jaspercountysc.gov/"],
  kershaw: ["https://www.kershaw.sc.gov/"],
  lancaster: [
    "https://www.lancastercountysc.gov",
    "https://www.lancastercountysc.gov/198/Tax-Sale-Procedures",
  ],
  laurens: ["https://laurenscounty.us/"],
  lee: ["https://www.leecountysc.org/"],
  lexington: [
    "https://lex-co.sc.gov",
    "https://lex-co.sc.gov/treasurer/delinquent-taxes",
  ],
  marion: ["https://www.marionsc.org/"],
  marlboro: ["https://marlborocounty.sc.gov/"],
  mccormick: ["http://www.mccormickcountysc.org"],
  newberry: ["https://www.newberrycounty.net/"],
  oconee: ["https://oconeesc.com/"],
  orangeburg: ["https://www.orangeburgcounty.org/"],
  pickens: ["https://www.pickenscountysc.gov"],
  richland: [
    "http://www.richlandcountysc.gov/",
    "https://www.richlandcountysc.gov/Property-Business/Taxes/Delinquent-Taxes/Tax-Sale",
  ],
  saluda: ["https://saludacounty.sc.gov/"],
  spartanburg: [
    "https://www.spartanburgcounty.org/",
    "https://www.spartanburgcounty.org/640/2025-Tax-Sale-Info",
  ],
  sumter: [
    "http://www.sumtercountysc.gov",
    "https://www.sumtercountysc.gov/departments/s_-_z/treasurer/delinquent_tax.php",
  ],
  union: ["https://www.gearupunionsc.com"],
  williamsburg: [
    "https://www.williamsburgcounty.sc.gov/",
    "https://www.williamsburgcounty.sc.gov/325/Delinquent-Tax-Sale",
  ],
  york: ["https://www.yorkcountysc.gov"],
};

module.exports = { SEEDS };
