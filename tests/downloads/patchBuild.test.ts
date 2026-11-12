import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { testFragmentIndex } from '../fixtures/downloads/fragmentIndex'
import { testFragmentSamples } from '../fixtures/downloads/fragmentSamples'
import { generateStoredSamples } from '../fixtures/downloads/mp4FragmentSamples'
import type * as mediabunny from 'mediabunny'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const installed = join(dirname(require.resolve('mediabunny')), '../..')
const script = fileURLToPath(
  new URL('../../scripts/buildMediabunnyPatch.ts', import.meta.url),
)

test('patch rebuild regenerates ESM, declarations and both CommonJS bundles from source', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'mediabunny-rebuild-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const source = join(directory, 'source')
  await cp(installed, source, { recursive: true })
  const artifacts = [
    ...[
      'output-format',
      'isobmff/isobmff-boxes',
      'isobmff/isobmff-demuxer',
      'isobmff/isobmff-muxer',
    ].flatMap(path => [
      `dist/modules/src/${path}.js`,
      `dist/modules/src/${path}.d.ts`,
    ]),
    'dist/bundles/mediabunny.cjs',
    'dist/bundles/mediabunny.node.cjs',
  ]
  for (const path of artifacts) {
    await writeFile(join(source, path), 'stale artifact')
  }
  const first = join(directory, 'first')
  const second = join(directory, 'second')
  for (const output of [first, second]) {
    await exec(process.execPath, ['--import', 'tsx', script, source, output])
  }
  for (const path of artifacts) {
    const rebuilt = await readFile(join(first, path), 'utf8')
    assert.doesNotMatch(rebuilt, /stale artifact/)
    assert.equal(rebuilt, await readFile(join(second, path), 'utf8'))
    assert.equal(await readFile(join(source, path), 'utf8'), 'stale artifact')
  }
  const declarations = await readFile(join(first, artifacts[1]!), 'utf8')
  assert.match(declarations, /_fragmentSampleStore/)
  context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) })
  const expected = await generateStoredSamples(
    undefined,
    await testFragmentIndex(context),
  )
  for (const path of [
    'dist/modules/src/index.js',
    'dist/bundles/mediabunny.cjs',
    'dist/bundles/mediabunny.node.cjs',
  ]) {
    const library: typeof mediabunny = path.endsWith('.cjs')
      ? require(join(first, path))
      : await import(pathToFileURL(join(first, path)).href)
    const result = await generateStoredSamples(
      await testFragmentSamples(context),
      await testFragmentIndex(context),
      library,
    )
    assert.deepEqual(result, expected)
  }
})

test('patch rebuild refuses unsafe destinations, unsupported versions and invalid source', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'mediabunny-rebuild-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const source = join(directory, 'source')
  await cp(installed, source, { recursive: true })
  const run = (output: string) =>
    exec(process.execPath, ['--import', 'tsx', script, source, output])
  await assert.rejects(
    run(join(source, 'nested')),
    /outside the source package/,
  )
  const existing = join(directory, 'existing')
  await mkdir(existing)
  await writeFile(join(existing, 'sentinel'), 'keep me')
  await assert.rejects(run(existing), /EEXIST/)
  assert.equal(await readFile(join(existing, 'sentinel'), 'utf8'), 'keep me')
  const metadata = await readFile(join(source, 'package.json'), 'utf8')
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({ name: 'mediabunny', version: '0.0.0' }),
  )
  await assert.rejects(run(join(directory, 'wrong-version')), /1\.62\.1/)
  await writeFile(join(source, 'package.json'), metadata)
  await appendFile(
    join(source, 'src/output-format.ts'),
    '\nexport const invalidPatch: number = "broken";\n',
  )
  await assert.rejects(
    run(join(directory, 'invalid-source')),
    /not assignable to type 'number'/,
  )
})
