import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import ts from 'typescript'
import { z } from 'zod'

const [sourceArgument, outputArgument, ...extra] = process.argv.slice(2)

if (!sourceArgument || !outputArgument || extra.length) {
  throw new Error(
    'Usage: tsx scripts/buildMediabunnyPatch.ts <package> <new-output-directory>',
  )
}

const source = await realpath(sourceArgument)
const output = join(
  await realpath(dirname(resolve(outputArgument))),
  basename(outputArgument),
)
const withinSource = relative(source, output)

if (
  !isAbsolute(withinSource)
  && withinSource !== '..'
  && !withinSource.startsWith(`..${sep}`)
) {
  throw new Error('Output must be outside the source package')
}

z.object({ name: z.literal('mediabunny'), version: z.literal('1.62.1') }).parse(
  JSON.parse(await readFile(join(source, 'package.json'), 'utf8')),
)
// Never write into the installed package or an existing pnpm patch workspace.
await mkdir(output)
await cp(source, output, { recursive: true, dereference: true })

const require = createRequire(import.meta.url)
const libraryRequire = createRequire(require.resolve('mediabunny'))
const roots = [
  'src/isobmff/isobmff-boxes.ts',
  'src/isobmff/isobmff-demuxer.ts',
  'src/isobmff/isobmff-muxer.ts',
  'src/output-format.ts',
].map(path => join(source, path))
const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  declaration: true,
  stripInternal: true,
  strict: true,
  noUncheckedIndexedAccess: true,
  skipLibCheck: true,
  rootDir: source,
  outDir: join(output, 'dist/modules'),
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: ['node', 'dom-webcodecs', 'dom-mediacapture-transform'],
  typeRoots: [
    dirname(dirname(require.resolve('@types/node/package.json'))),
    ...['dom-webcodecs', 'dom-mediacapture-transform'].map(name =>
      dirname(dirname(libraryRequire.resolve(`@types/${name}/package.json`))),
    ),
  ],
}
const host = ts.createCompilerHost(options)

// The npm package omits shared TS sources and its root tsconfig. Resolve only
// missing shared imports through published declarations; check all src imports.
host.resolveModuleNames = (names, containingFile) =>
  names.map(name => {
    const resolved = ts.resolveModuleName(
      name,
      containingFile,
      options,
      host,
    ).resolvedModule

    if (!resolved && name.startsWith('.')) {
      const path = resolve(dirname(containingFile), name)
      const declaration = `${join(source, 'dist/modules', relative(source, path))}.d.ts`

      if (ts.sys.fileExists(declaration)) {
        return {
          resolvedFileName: declaration,
          extension: ts.Extension.Dts,
        }
      }
    }

    return resolved
  })
const program = ts.createProgram(roots, options, host)
// Check the maintained sources against inferred upstream types. Unchanged
// upstream sources target older Node/TS typings, so their semantic diagnostics
// are outside this four-file rebuild; syntax/options diagnostics still fail.
const diagnostics = [
  ...program.getOptionsDiagnostics(),
  ...program.getGlobalDiagnostics(),
  ...program.getSyntacticDiagnostics(),
  ...roots.flatMap(path =>
    program.getSemanticDiagnostics(program.getSourceFile(path)),
  ),
]

if (diagnostics.length) {
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: path => path,
      getCurrentDirectory: () => source,
      getNewLine: () => '\n',
    }),
  )
}

const artifacts = new Set(
  roots.flatMap(root => {
    const base = join(output, 'dist/modules', relative(source, root)).slice(
      0,
      -3,
    )

    return [`${base}.js`, `${base}.d.ts`]
  }),
)
const result = program.emit(undefined, (path, text) => {
  if (!artifacts.has(path)) {
    return
  }

  // Match the published ESM specifiers in both runtime and declaration files.
  text = text.replace(
    /(from\s+|import\()(['"])(\.[^'"]+)\2/g,
    (match, prefix: string, quote: string, specifier: string) =>
      specifier.endsWith('.js')
        ? match
        : `${prefix}${quote}${specifier}.js${quote}`,
  )
  ts.sys.writeFile(path, text)
})

if (result.emitSkipped || result.diagnostics.length) {
  throw new Error(
    ts.formatDiagnostics(result.diagnostics, host)
      || 'TypeScript skipped patch artifact emission',
  )
}

// Reuse the exact esbuild already locked through tsx; never download tooling.
const esbuild = createRequire(require.resolve('tsx/package.json')).resolve(
  'esbuild/bin/esbuild',
)
const exec = promisify(execFile)
const license = (await readFile(join(source, 'src/index.ts'), 'utf8')).match(
  /^\/\*![\s\S]*?\*\//,
)?.[0]

if (!license) {
  throw new Error('Missing upstream license banner')
}

for (const platform of ['browser', 'node']) {
  await exec(
    esbuild,
    [
      'dist/modules/src/index.js',
      '--bundle',
      '--format=iife',
      '--global-name=Mediabunny',
      '--target=es2020',
      '--legal-comments=inline',
      `--platform=${platform}`,
      `--banner:js=${license}`,
      '--footer:js=if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Mediabunny)',
      `--outfile=dist/bundles/mediabunny${platform === 'node' ? '.node' : ''}.cjs`,
    ],
    { cwd: output },
  )
}

const version = await exec(esbuild, ['--version'])

console.info(
  `Rebuilt mediabunny@1.62.1 with TypeScript ${ts.version} and esbuild ${version.stdout.trim()} in ${output}`,
)
