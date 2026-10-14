import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist/**', 'android/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'scripts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      // намеренный any у словарей/сцен — точечным disable с причиной, а не глобально
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // узкие deps у подписок — точечным disable с причиной
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Граница контента и движка: правила видят игру через ContentApi, а не весь Game.
    // Тип ContentApi — главный страж (S в нём нет); это правило — ранняя обратная связь в редакторе,
    // полный AST-страж (все виды импорта, обходы через any/деструктуризацию) — content/rules/boundary.test.ts.
    files: ['src/content/rules/*.ts'],
    ignores: ['src/content/rules/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: '../../engine/game', importNames: ['Game'], message: 'тип игры для правил — ContentApi; весь Game контенту не виден' }],
      }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.type='Identifier'][object.name=/^(game|g)$/][property.type='Identifier'][property.name='S']",
          message: 'состояние игры — через производные читатели и методы ContentApi (mem, day, debt, facts, …), не через S.',
        },
        {
          selector: "MemberExpression[object.type='Identifier'][object.name=/^(game|g)$/][property.type='Literal'][property.raw='\"S\"']",
          message: 'обход через game["S"] — то же обращение к состоянию напрямую; используй ContentApi.',
        },
      ],
    },
  },
  prettier,
)
