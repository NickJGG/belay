import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { codeBlockNode, fenceLanguage } from "../code-fence.ts";

describe("code fences", () => {
  test("a fence's language is its word, lowercased", () => {
    assert.equal(fenceLanguage("ts"), "ts");
    assert.equal(fenceLanguage(" Python "), "python");
  });

  test("no word or a plain-text word means no language", () => {
    for (const lang of [undefined, null, "", "  ", "text", "TXT", "plaintext", "output", "console"]) {
      assert.equal(fenceLanguage(lang), null, String(lang));
    }
  });

  test("a fence becomes a code-block element carrying its word and code", () => {
    assert.deepEqual(codeBlockNode({ lang: "ts", value: "const a = 1;" }).data, {
      hName: "code-block",
      hProperties: { lang: "ts", code: "const a = 1;" },
      hChildren: [],
    });
    assert.equal(codeBlockNode({ value: "x" }).data.hProperties.lang, "");
  });
});
