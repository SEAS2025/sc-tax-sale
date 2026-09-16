"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const destDir = path.join(root, "site", "data");
fs.mkdirSync(destDir, { recursive: true });

for (const name of ["sc.json"]) {
  fs.copyFileSync(path.join(root, "counties", name), path.join(destDir, name));
}
fs.copyFileSync(path.join(root, "counties", "extras.json"), path.join(destDir, "extras.json"));
console.log("synced county registry into site/data");
