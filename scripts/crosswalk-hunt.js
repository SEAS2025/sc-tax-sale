#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { registry, repeat } = require("../engine");

const adsPath = path.join(__dirname, "..", "site", "data", "ads.json");
const ads = fs.existsSync(adsPath) ? JSON.parse(fs.readFileSync(adsPath, "utf8")) : { counties: [] };

repeat.run(registry.listCounties(), {
  ads,
  previous: repeat.loadPrevious(),
}).then((snapshot) => {
  repeat.writeSnapshot(snapshot);
  console.log(JSON.stringify(repeat.publicSnapshot(snapshot), null, 2));
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
