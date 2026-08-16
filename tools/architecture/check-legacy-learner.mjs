import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { format } from "prettier";
import ts from "typescript";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const legacyRef =
  process.env.SYLIS_LEGACY_LEARNER_REF ??
  "47c58b2f643616d129b4fc7ce06cff6056b8b3f3";
const legacySourceRoot = "apps/web/src";
const currentSourceRoot = "apps/frontends/web/src";

// These files intentionally bridge the old learner surface to the new backend,
// fix an old interaction that prevented the original command from working, or
// add non-visual accessibility/type metadata. Every other old source file must
// remain formatter-normalized source equivalent to the reference commit.
const reviewedSourceDifferences = new Set([
  "App.tsx",
  "components/books/Books.tsx",
  "components/chat/chat-config/ChatConfig.tsx",
  "components/chat/chat-sidebar/ChatSidebar.tsx",
  "components/chat/hooks/useAIChat.ts",
  "components/grammar-analysis/GrammarAnalysis.tsx",
  "components/grammar-analysis/GrammarAnalysisModal.tsx",
  "components/input/Input.stories.tsx",
  "components/input/Input.tsx",
  "components/interactive-text/InteractiveText.tsx",
  "components/quick-toolbar/QuickToolbar.tsx",
  "components/word-detail/WordDetail.tsx",
  "components/word-detail/components/common-list/CommonList.tsx",
  "components/word-detail-modal/WordDetailModal.tsx",
  "components/word-quiz-choice/WordQuizChoice.stories.tsx",
  "components/word-quiz-choice/WordQuizChoice.tsx",
  "components/word-recognition/WordRecognition.tsx",
  "components/word-selector/WordSelector.tsx",
  "hooks/useGlobalWordInteraction.ts",
  "hooks/useWordCollection.ts",
  "modules/ai/api/index.ts",
  "modules/articles/api/index.ts",
  "modules/books/api/index.ts",
  "modules/chat/api/index.ts",
  "modules/chat/store/config.ts",
  "modules/chat/store/index.ts",
  "modules/learning/api/index.ts",
  "modules/reddit/api/index.ts",
  "modules/reddit/index.ts",
  "modules/user/api/index.ts",
  "modules/user/store/index.ts",
  "modules/vocabulary/api/notebook.ts",
  "modules/vocabulary/api/test.ts",
  "modules/vocabulary/api/words.ts",
  "pages/ai/chat/index.tsx",
  "pages/ai/cloze-reading/index.tsx",
  "pages/auth/login/hooks/useLogin.ts",
  "pages/auth/login/index.tsx",
  "pages/auth/register/hooks/useRegister.ts",
  "pages/auth/register/index.tsx",
  "pages/common/articles/article-detail/index.tsx",
  "pages/common/articles/components/article-header/ArticleHeader.tsx",
  "pages/common/book-detail/index.tsx",
  "pages/common/books/BooksPage.tsx",
  "pages/common/vocabulary-book/index.tsx",
  "pages/common/word-detail/index.tsx",
  "pages/explore/reddit/components/comment/index.tsx",
  "pages/explore/reddit/components/post-list/PostList.tsx",
  "pages/explore/reddit/components/reddit-post/index.tsx",
  "pages/explore/reddit/history/index.tsx",
  "pages/explore/reddit/hooks/useRedditInteraction.ts",
  "pages/explore/reddit/hooks/useRedditPosts.ts",
  "pages/explore/reddit/hooks/useSubreddits.ts",
  "pages/explore/reddit/index.tsx",
  "pages/explore/reddit/post-detail/index.tsx",
  "pages/explore/reddit/saved/index.tsx",
  "pages/me/index/index.tsx",
  "pages/me/profile/index.tsx",
  "pages/me/test-exam/index.tsx",
  "pages/me/test-history/index.tsx",
  "pages/vocabulary/learning/index.tsx",
  "pages/vocabulary/practice/components/word-detail-stage/WordDetailStage.tsx",
  "pages/vocabulary/practice/components/word-learning-stage/WordLearningStage.tsx",
  "pages/vocabulary/practice/components/word-practice-header/WordPracticeHeader.tsx",
  "pages/vocabulary/practice/components/word-quiz-stage/WordQuizStage.tsx",
  "pages/vocabulary/practice/context/VocabularyPracticeContext.tsx",
  "pages/vocabulary/practice/context/VocabularyPracticeProvider.tsx",
  "pages/vocabulary/practice/hooks/useAudio.ts",
  "pages/vocabulary/practice/hooks/useDataLoader.ts",
  "pages/vocabulary/practice/hooks/useRoundManager.ts",
  "pages/vocabulary/practice/hooks/useVocabularyPractice.ts",
  "pages/vocabulary/practice/hooks/useWordActions.ts",
  "pages/vocabulary/practice/hooks/useWordProgress.ts",
  "pages/vocabulary/practice/hooks/useWordState.ts",
  "router/AuthGuard.tsx",
  "router/Routes.tsx",
  "stores/reddit-store.ts",
]);

const reviewedStaticDifferences = new Set([
  "pages/auth/login/index.module.less",
  "pages/auth/register/index.module.less",
]);

const reviewedJsxDifferences = new Set([
  "App.tsx",
  "components/input/Input.tsx",
  "pages/auth/login/index.tsx",
  "pages/auth/register/index.tsx",
  "router/Routes.tsx",
]);

function git(...args) {
  return execFileSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function legacySource(relativePath) {
  return git("show", `${legacyRef}:${legacySourceRoot}/${relativePath}`);
}

function currentSource(relativePath) {
  return readFileSync(
    `${workspaceRoot}/${currentSourceRoot}/${relativePath}`,
    "utf8",
  );
}

function sourceFile(source, fileName) {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function exportedNames(source, fileName) {
  const file = sourceFile(source, fileName);
  const names = new Set();

  function addBindingName(name) {
    if (ts.isIdentifier(name)) {
      names.add(name.text);
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) addBindingName(element.name);
      }
    }
  }

  for (const statement of file.statements) {
    if (ts.isExportAssignment(statement)) {
      names.add("default");
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) {
        names.add(`*:${statement.moduleSpecifier?.getText(file) ?? ""}`);
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          names.add(element.name.text);
        }
      }
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    if (
      !modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      continue;
    }
    if (
      modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      )
    ) {
      names.add("default");
    }
    if (
      "name" in statement &&
      statement.name &&
      ts.isIdentifier(statement.name)
    ) {
      names.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        addBindingName(declaration.name);
      }
    }
  }

  return names;
}

function normalizedTypeScript(source, relativePath) {
  return format(source, {
    parser: "typescript",
    singleQuote: true,
    semi: true,
    tabWidth: 2,
    filepath: relativePath,
  });
}

function syntaxShape(node, file) {
  if (ts.isParenthesizedExpression(node)) {
    return syntaxShape(node.expression, file);
  }
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  ) {
    return jsxShape(node, file);
  }

  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  if (children.length === 0) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return [ts.SyntaxKind[node.kind], node.text];
    }
    return [ts.SyntaxKind[node.kind], node.getText(file)];
  }

  return [
    ts.SyntaxKind[node.kind],
    children.map((child) => syntaxShape(child, file)),
  ];
}

function expressionJsxShape(expression, file) {
  const roots = [];

  function visit(node) {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      roots.push(jsxShape(node, file));
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(expression);
  return roots.length > 0 ? roots : ["dynamic"];
}

function attributeShape(attribute, file) {
  if (ts.isJsxSpreadAttribute(attribute)) {
    return ["spread", syntaxShape(attribute.expression, file)];
  }

  const name = attribute.name.getText(file);
  if (name.startsWith("aria-")) return null;
  if (!attribute.initializer) return [name, true];
  if (ts.isStringLiteral(attribute.initializer)) {
    return [name, attribute.initializer.text];
  }
  if (ts.isJsxExpression(attribute.initializer)) {
    if (!attribute.initializer.expression) return [name, true];
    if (name === "className") {
      return [name, syntaxShape(attribute.initializer.expression, file)];
    }
    return [name, expressionJsxShape(attribute.initializer.expression, file)];
  }
  return [name, syntaxShape(attribute.initializer, file)];
}

function openingShape(opening, file) {
  return {
    tag: opening.tagName.getText(file),
    attributes: opening.attributes.properties
      .map((attribute) => attributeShape(attribute, file))
      .filter(Boolean),
  };
}

function childShape(child, file) {
  if (ts.isJsxText(child)) {
    const text = child.getText(file).replace(/\s+/g, " ").trim();
    return text ? ["text", text] : null;
  }
  if (ts.isJsxExpression(child)) {
    return child.expression
      ? ["expression", expressionJsxShape(child.expression, file)]
      : null;
  }
  return jsxShape(child, file);
}

function jsxShape(node, file) {
  if (ts.isJsxSelfClosingElement(node)) {
    return ["self-closing", openingShape(node, file)];
  }
  if (ts.isJsxFragment(node)) {
    return [
      "fragment",
      node.children.map((child) => childShape(child, file)).filter(Boolean),
    ];
  }
  return [
    "element",
    openingShape(node.openingElement, file),
    node.children.map((child) => childShape(child, file)).filter(Boolean),
  ];
}

function jsxRoots(source, fileName) {
  const file = sourceFile(source, fileName);
  const roots = [];

  function visit(node) {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      roots.push(jsxShape(node, file));
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return roots;
}

function routeSignature(source, fileName) {
  const file = sourceFile(source, fileName);
  const signatures = [];

  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "path" &&
      ts.isStringLiteral(node.initializer)
    ) {
      const object = node.parent;
      const element = object.properties.find(
        (property) =>
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === "element",
      );
      signatures.push([
        node.initializer.text,
        element && ts.isPropertyAssignment(element)
          ? syntaxShape(element.initializer, file)
          : null,
      ]);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return signatures;
}

const legacyFiles = git(
  "ls-tree",
  "-r",
  "--name-only",
  legacyRef,
  "--",
  legacySourceRoot,
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((path) => path.slice(`${legacySourceRoot}/`.length));

const failures = [];
for (const relativePath of legacyFiles) {
  let current;
  try {
    current = currentSource(relativePath);
  } catch {
    failures.push(`${relativePath}: missing from ${currentSourceRoot}`);
    continue;
  }

  const legacy = legacySource(relativePath);
  if (!relativePath.endsWith(".ts") && !relativePath.endsWith(".tsx")) {
    if (legacy !== current && !reviewedStaticDifferences.has(relativePath)) {
      failures.push(`${relativePath}: static asset differs from ${legacyRef}`);
    }
    continue;
  }

  const legacyExports = exportedNames(legacy, relativePath);
  const currentExports = exportedNames(current, relativePath);
  const missingExports = [...legacyExports].filter(
    (name) => !currentExports.has(name),
  );
  if (missingExports.length > 0) {
    failures.push(
      `${relativePath}: missing legacy exports ${missingExports.join(", ")}`,
    );
  }

  if (
    !reviewedSourceDifferences.has(relativePath) &&
    (await normalizedTypeScript(legacy, relativePath)) !==
      (await normalizedTypeScript(current, relativePath))
  ) {
    failures.push(
      `${relativePath}: unreviewed source difference from ${legacyRef}`,
    );
  }

  if (relativePath.endsWith(".tsx")) {
    const legacyShape = jsxRoots(legacy, relativePath);
    const currentShape = jsxRoots(current, relativePath);
    if (
      !reviewedJsxDifferences.has(relativePath) &&
      JSON.stringify(legacyShape) !== JSON.stringify(currentShape)
    ) {
      failures.push(
        `${relativePath}: rendered JSX structure differs from ${legacyRef}`,
      );
    }
  }
}

const routePath = "router/Routes.tsx";
const legacyRoutes = routeSignature(legacySource(routePath), routePath);
const currentRoutes = new Set(
  routeSignature(currentSource(routePath), routePath).map((route) =>
    JSON.stringify(route),
  ),
);
const missingLegacyRoutes = legacyRoutes.filter(
  (route) => !currentRoutes.has(JSON.stringify(route)),
);
if (missingLegacyRoutes.length > 0) {
  failures.push(
    `${routePath}: missing or changed legacy routes ${missingLegacyRoutes
      .map(([path]) => path)
      .join(", ")} from ${legacyRef}`,
  );
}

const mainSource = currentSource("main.tsx");
if (!mainSource.includes("import App from './App'")) {
  failures.push(
    "main.tsx: Learner Web must boot the legacy-compatible App entry",
  );
}
if (
  !mainSource.includes("import { setRem } from './utils/setRem'") ||
  !/\bsetRem\(\);?/.test(mainSource)
) {
  failures.push(
    "main.tsx: legacy responsive root-font initialization is missing",
  );
}

if (failures.length > 0) {
  console.error("Legacy Learner parity check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const staticAssetCount = legacyFiles.filter(
    (path) => !path.endsWith(".ts") && !path.endsWith(".tsx"),
  ).length;
  const typeScriptCount = legacyFiles.filter((path) =>
    path.endsWith(".ts"),
  ).length;
  const tsxCount = legacyFiles.filter((path) => path.endsWith(".tsx")).length;
  console.log(
    `Legacy Learner parity passed: ${legacyFiles.length} files, ${staticAssetCount} static assets, ${typeScriptCount} TS files, ${tsxCount} TSX files, ${reviewedSourceDifferences.size} reviewed source differences, ${reviewedStaticDifferences.size} reviewed static differences, ${reviewedJsxDifferences.size} reviewed JSX differences (${legacyRef}).`,
  );
}
