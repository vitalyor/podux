import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import i18next from "i18next";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const locales = Object.fromEntries(
  ["en", "zh", "ru"].map((lang) => [
    lang,
    JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url))),
  ])
);
function flatten(value, prefix = "") {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      typeof item === "string"
        ? [[prefix + key, item]]
        : Object.entries(flatten(item, prefix + key + "."))
    )
  );
}
const base = flatten(locales.en);
for (const lang of ["zh", "ru"]) {
  const translated = flatten(locales[lang]);
  assert.deepEqual(
    Object.keys(translated).sort(),
    Object.keys(base).sort(),
    `${lang}: missing translation keys`
  );
  for (const [key, text] of Object.entries(base)) {
    assert.ok(translated[key].trim(), `${lang}.${key}: empty translation`);
    assert.deepEqual(
      translated[key].match(/{{.*?}}/g),
      text.match(/{{.*?}}/g),
      `${lang}.${key}: interpolation mismatch`
    );
  }
}
await i18next.init({
  lng: "ru",
  fallbackLng: "en",
  resources: { ru: { translation: locales.ru } },
});
assert.equal(i18next.t("nav.servers"), "Подключения");
assert.equal(i18next.t("nav.proxies"), "Туннели");
for (const count of [0, 1, 2, 5, 21, 101]) {
  assert.equal(i18next.t("import.selectedCount", { count }), `Выбрано туннелей: ${count}`);
}
console.log(
  `Locales verified: ${Object.keys(base).length} keys, placeholders and Russian UI labels`
);

// Verify literal keys, including both branches of t(condition ? keyA : keyB).
function keysFromExpression(node) {
  if (ts.isStringLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node))
    return [...keysFromExpression(node.whenTrue), ...keysFromExpression(node.whenFalse)];
  return [];
}
function checkDirectory(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(path);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const file = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      entry.name.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        node.arguments.length &&
        ((ts.isIdentifier(node.expression) && node.expression.text === "t") ||
          (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "t"))
      ) {
        for (const key of keysFromExpression(node.arguments[0]))
          assert.ok(key in base, `${path}: missing translation ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
}
checkDirectory(fileURLToPath(new URL("../src", import.meta.url)));
console.log("UI translation references verified");
