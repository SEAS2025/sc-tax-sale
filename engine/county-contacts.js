"use strict";

/**
 * Official county-office contacts for the five paired 5-year counties.
 * Phones, emails, and addresses are taken from published county pages
 * (checked 16 Sep 2026). These are office contacts, never owners.
 */

const CONTACTS = {
  calhoun: {
    office: "Calhoun County Tax Collector",
    phone: "(803) 874-4021",
    email: "TGreen@CalhounCounty.SC.Gov",
    address: "102 Courthouse Drive, Suite 103, St. Matthews, SC 29135",
    url: "https://calhouncounty.sc.gov/departments/tax-collector",
  },
  charleston: {
    office: "Charleston County Delinquent Tax Division",
    phone: "(843) 202-6570",
    email: "DelinquentTax@CharlestonCounty.org",
    address: "4045 Bridge View Drive, North Charleston, SC 29405",
    url: "https://www.charlestoncounty.gov/departments/delinquent-tax/tax-sale.php",
  },
  florence: {
    office: "Florence County Delinquent Tax Office",
    phone: "(843) 665-3095",
    email: "DelinquentTax@florencecountysc.gov",
    address: "180 N. Irby Street, Room 107, Florence, SC 29501",
    url: "https://www.florencecountysc.gov/offices/delinquent-tax/",
  },
  lexington: {
    office: "Lexington County Delinquent Tax Department",
    phone: "(803) 785-8345",
    email: "jeckstrom@lexingtoncounty.sc.gov",
    address: "212 South Lake Drive, Suite 101, Lexington, SC 29072",
    url: "https://lex-co.sc.gov/treasurer/delinquent-taxes",
  },
  williamsburg: {
    office: "Williamsburg County Delinquent Tax Office",
    phone: "843-355-9321, ext. 5800",
    email: "TaxCollector@williamsburgcounty.sc.gov",
    address: "P.O. Box 477, Kingstree, SC 29556",
    url: "https://www.williamsburgcounty.sc.gov/325/Delinquent-Tax-Sale",
  },
};

function getContact(id) {
  return CONTACTS[id] ? Object.assign({}, CONTACTS[id]) : null;
}

module.exports = {
  CONTACTS,
  getContact,
};
