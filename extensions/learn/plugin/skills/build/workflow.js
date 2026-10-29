export const meta = {
  name: 'learn-build',
  description: 'Course build: survey a subject, or collect, write and verify course material per topic',
  whenToUse: 'Launched by /learn:build with args.mode survey | produce | resolve',
  phases: [
    { title: 'Survey', detail: 'four broad sweeps, then a plan and map' },
    { title: 'Collect', detail: 'cache sources per topic, two angles', model: 'sonnet' },
    { title: 'Write', detail: 'knowledge, exercises, field misconceptions per topic', model: 'opus' },
    { title: 'Resolve', detail: 'research verify.md items into the corpus' },
    { title: 'Verify', detail: 'independent claim and solution checks, then apply' },
    { title: 'Assemble', detail: 'rubrics, syllabus, source index, verification totals' },
  ],
}

// args: see the "Workflow args" section of SKILL.md. No filesystem here: every
// read and write happens inside agents, and resume across sessions relies on
// the .build/ marker files the coordinator inspects before launching.
const A = args || {}
const { mode, plugin: P, course: C, date: D } = A
if (!['survey', 'produce', 'resolve'].includes(mode) || !P || !C || !D) {
  throw new Error('args need mode (survey | produce | resolve), plugin, course and date')
}

// Every agent pays a fixed ~30k-token startup, so claim checks go in few, full
// batches grouped by cited source: a verifier then reads each source once.
const BATCH = 20

// Opus where the corpus's truth is decided; Sonnet where the output is mechanical
// or rechecked downstream (collected sources only count once a verifier has read them).
const TIER = {
  sweep: { model: 'sonnet' },
  plan: { model: 'opus' },
  collect: { model: 'sonnet' },
  resolve: { model: 'opus' },
  write: { model: 'opus' },
  verify: { model: 'opus' },
  apply: { model: 'sonnet', effort: 'low' },
  rubric: { model: 'sonnet' },
  assemble: { model: 'sonnet', effort: 'low' },
}

const head = (role, section, task) => [
  `You are the ${role} in a course build. Follow the "${section}" section of your role file.`,
  `Course folder: ${C}`,
  `Today: ${D}`,
  `Read first: ${P}/references/formats.md (the course format contract), ${P}/skills/build/references/${role}.md (your role), and ${C}/course.md (goal, level, scope).`,
  '',
  task,
].join('\n')

const str = { type: 'string' }
const strs = { type: 'array', items: str }
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required })

const PLAN = obj({
  units: { type: 'array', items: obj({
    n: { type: 'integer' }, title: str,
    topics: { type: 'array', items: obj({ slug: str, title: str, summary: str, prereqs: strs }) },
  }) },
  out: { type: 'array', items: obj({ area: str, reason: str }) },
  backbone: { type: 'array', items: obj({
    title: str, url: str, licence: str, access: { enum: ['open', 'owned', 'paid'] }, fit: str,
  }) },
  traits: { type: 'array', items: { enum: ['notation', 'code', 'language', 'reading'] } },
  notes: str,
})
const COLLECT = obj({ sources: strs, thin: { type: 'boolean' }, notes: str })
const WRITE = obj({ claims: { type: 'array', items: obj({ id: str, source: str }) }, exercises: strs, misconceptions: { type: 'integer' }, notes: str })
const VERDICTS = obj({ verdicts: { type: 'array', items: obj({
  id: str, verdict: { enum: ['verified', 'corrected', 'cut'] }, reason: str, fix: str,
}, ['id', 'verdict', 'reason']) } })
const RESOLVED = obj({ items: { type: 'array', items: obj({
  n: { type: 'integer' }, outcome: { enum: ['folded', 'rejected'] }, id: str, reason: str,
}, ['n', 'outcome', 'reason']) } })
const OK = obj({ ok: { type: 'boolean' }, notes: str })
const SUMMARY = obj({
  totals: obj({
    sources: { type: 'integer' }, claims: { type: 'integer' }, verified: { type: 'integer' },
    corrected: { type: 'integer' }, cut: { type: 'integer' }, exercises: { type: 'integer' },
  }),
  topics: { type: 'array', items: obj({
    slug: str, sources: { type: 'integer' }, claims: { type: 'integer' },
    cut: { type: 'integer' }, exercises: { type: 'integer' },
  }) },
  gaps: { type: 'array', items: obj({ topic: str, kind: str, detail: str }) },
})

// Claims are {id, source} or bare ids (source unknown, e.g. from resolve).
// Source groups are packed first-fit, largest first; a group over BATCH splits.
const batches = claims => {
  const groups = new Map()
  for (const c of claims) {
    const { id, source = '' } = typeof c === 'string' ? { id: c } : c
    if (!groups.has(source)) groups.set(source, [])
    groups.get(source).push(id)
  }
  const pieces = []
  for (const [source, ids] of groups) {
    for (let i = 0; i < ids.length; i += BATCH) pieces.push({ sources: [source], ids: ids.slice(i, i + BATCH) })
  }
  pieces.sort((a, b) => b.ids.length - a.ids.length)
  const out = []
  for (const p of pieces) {
    const b = out.find(x => x.ids.length + p.ids.length <= BATCH)
    if (b) { b.ids.push(...p.ids); b.sources.push(...p.sources) } else out.push(p)
  }
  return out
}

// Claim and exercise checks for one topic, then a single applier edits the
// file (parallel verifiers never write). Returns null if any check died, so
// no verify marker is written and the topic is retried next run.
const verifyTopic = async (slug, claims, exercises) => {
  const jobs = batches(claims).map((b, i) => () => {
    const cites = b.sources.filter(Boolean).map(s => `sources/${s}`)
    return agent(head('verifier', 'Claims',
      `Topic: ${slug}. Check exactly these claims in ${C}/knowledge/${slug}.md: ${b.ids.map(x => '^' + x).join(', ')}.${cites.length ? `\nThey cite ${cites.join(', ')}.` : ''}`),
    { label: `verify:${slug}:${i + 1}`, phase: 'Verify', schema: VERDICTS, ...TIER.verify })
  })
  if (exercises !== null) {
    jobs.push(() => agent(head('verifier', 'Exercises',
      `Topic: ${slug}. Check ${exercises === 'all' ? 'every exercise' : `only exercises ${exercises.join(', ')}`} in ${C}/exercises/${slug}.md. Return verdicts with ids like "e3".`),
    { label: `verify:${slug}:exercises`, phase: 'Verify', schema: VERDICTS, ...TIER.verify }))
  }
  if (!jobs.length) return { verdicts: [] }
  const got = await parallel(jobs)
  if (got.some(g => g === null)) return null
  const verdicts = got.flatMap(g => g.verdicts)
  const applied = await agent(head('verifier', 'Apply',
    `Topic: ${slug}. Apply these verdicts to ${C}/knowledge/${slug}.md and ${C}/exercises/${slug}.md, then append one line per verdict to ${C}/.build/verify/${slug}.md (create it if missing; it is the topic's verify marker, so write it last).\n${JSON.stringify(verdicts, null, 1)}`),
  { label: `apply:${slug}`, phase: 'Verify', schema: OK, ...TIER.apply })
  return applied && applied.ok ? { verdicts } : null
}

const tally = verdicts => {
  const claims = verdicts.filter(v => /^c\d+$/.test(v.id))
  const n = k => claims.filter(v => v.verdict === k).length
  return { checked: claims.length, verified: n('verified'), corrected: n('corrected'), cut: n('cut') }
}

const assemble = rubricUnits => {
  const jobs = [() => agent(head('writer', 'Assemble',
    `Rebuild ${C}/sources/index.md, ${C}/verification.md and the "Known in the field" section of ${C}/misconceptions.md from the files on disk, and update ${C}/syllabus.md from ${C}/.build/plan.json, including the ready units' reading lines when ${C}/course.md has reading: start. Then return the summary.`),
  { label: 'assemble', phase: 'Assemble', schema: SUMMARY, ...TIER.assemble })]
  for (const u of rubricUnits) {
    jobs.push(() => agent(head('writer', 'Rubric',
      `Write ${C}/rubrics/unit-${u.n}.md for unit ${u.n} · ${u.title}, covering topics: ${u.topics.join(', ')}.`),
    { label: `rubric:unit-${u.n}`, phase: 'Assemble', schema: OK, ...TIER.rubric }))
  }
  return parallel(jobs)
}

if (mode === 'survey') {
  if (!A.tag) throw new Error('survey needs args.tag')
  const dir = `${C}/.build/survey/${A.tag}`
  const scope = A.area
    ? `Survey only the area "${A.area}", as an extension of the existing course (its approved plan is ${C}/.build/plan.json).`
    : 'Survey the whole subject as it bears on the goal.'
  const ANGLES = [
    ['curricula', 'How do university courses, standard syllabi and exam specifications sequence this material for a goal like this one?'],
    ['texts', 'Which textbooks, open textbooks and lecture-note sets cover it? Which could serve as the backbone (sequence plus exercises), and what are their licence and access?'],
    ['structure', 'What are the concepts and their prerequisites, what is the wider field around the goal, and what can the goal do without?'],
    ['pitfalls', 'What do learners find hard, which misconceptions are documented, and how is mastery usually assessed?'],
  ]
  phase('Survey')
  const notes = await parallel(ANGLES.map(([key, ask]) => () => agent(head('surveyor', 'Sweep',
    `${scope}\nAngle: ${key}. Key question: ${ask}\nWrite your notes to ${dir}/${key}.md.`),
  { label: `survey:${key}`, phase: 'Survey', ...TIER.sweep })))
  const missing = ANGLES.filter((_, i) => notes[i] === null).map(([k]) => k)
  if (missing.length) log(`survey sweeps that died: ${missing.join(', ')}; the plan works without them`)
  const plan = await agent(head('surveyor', 'Plan',
    `${scope}\nSweep notes: ${ANGLES.filter((_, i) => notes[i] !== null).map(([k]) => `${dir}/${k}.md`).join(', ')}.\nWrite ${dir}/plan.md, ${dir}/plan.json and ${dir}/map.md, then return the plan.`),
  { label: 'plan', phase: 'Survey', schema: PLAN, ...TIER.plan })
  return { mode, tag: A.tag, plan, missing }
}

if (mode === 'produce') {
  const done = A.done || {}
  const given = A.claims || {}
  const fill = A.fill || {}
  const has = (slug, k) => (done[slug] || []).includes(k)
  const gap = slug => (fill[slug] ? `\nGap to fill (enrich mode): ${fill[slug]}` : '')

  const collect = async t => {
    const angles = ['primary', 'practice'].filter(a => !has(t.slug, `collect-${a}`))
    const got = await parallel(angles.map(a => () => agent(head('collector', 'Collect',
      `Topic: ${t.slug} (${t.title}). Angle: ${a}.${gap(t.slug)}\nCache sources into ${C}/sources/, then write your manifest last, to ${C}/.build/collect/${t.slug}.${a}.md.`),
    { label: `collect:${t.slug}:${a}`, phase: 'Collect', schema: COLLECT, ...TIER.collect })))
    if (got.some(g => g === null)) return { slug: t.slug, failed: 'collect' }
    return { slug: t.slug, thin: got.some(g => g.thin) }
  }

  const write = async (prev, t) => {
    if (prev.failed) return prev
    if (has(t.slug, 'write')) return { ...prev, claims: given[t.slug] || [], exercises: 'all' }
    const r = await agent(head('writer', 'Topic',
      `Topic: ${t.slug} (${t.title}), unit ${t.unit}.${gap(t.slug)}\nSources: the manifests ${C}/.build/collect/${t.slug}.*.md. Write ${C}/knowledge/${t.slug}.md and ${C}/exercises/${t.slug}.md, then your marker ${C}/.build/write/${t.slug}.md last.`),
    { label: `write:${t.slug}`, phase: 'Write', schema: WRITE, ...TIER.write })
    if (!r) return { ...prev, failed: 'write' }
    return { ...prev, claims: r.claims, exercises: r.exercises }
  }

  const verify = async (prev, t) => {
    if (prev.failed || has(t.slug, 'verify')) return prev
    if (!prev.claims.length) log(`${t.slug}: no claims to verify`)
    const ex = prev.exercises === 'all' || prev.exercises.length ? prev.exercises : null
    const v = await verifyTopic(t.slug, prev.claims, ex)
    if (!v) return { ...prev, failed: 'verify' }
    return { ...prev, ...tally(v.verdicts) }
  }

  const topics = A.topics || []
  const results = await pipeline(topics, collect, write, verify)
  const failed = new Set(results.map((r, i) => (r && !r.failed ? null : topics[i].slug)).filter(Boolean))
  if (failed.size) log(`unfinished topics, rerun to resume: ${[...failed].join(', ')}`)

  phase('Assemble')
  const units = (A.units || []).filter(u => !u.topics.some(s => failed.has(s)))
  const skipped = (A.units || []).filter(u => !units.includes(u)).map(u => u.n)
  if (skipped.length) log(`rubrics held back for units with unfinished topics: ${skipped.join(', ')}`)
  const [summary, ...rubrics] = await assemble(units)
  return {
    mode,
    topics: results.map((r, i) => r || { slug: topics[i].slug, failed: 'unknown' }),
    rubrics: units.map((u, i) => ({ unit: u.n, ok: !!(rubrics[i] && rubrics[i].ok) })),
    summary,
  }
}

if (mode === 'resolve') {
  const groups = []
  for (const it of A.items || []) {
    let g = groups.find(x => x.topic === it.topic)
    if (!g) groups.push(g = { topic: it.topic, items: [] })
    g.items.push(it)
  }

  const research = g => agent(head('collector', 'Resolve',
    `Topic: ${g.topic}. Resolve these verify.md items (n is the line number):\n${JSON.stringify(g.items, null, 1)}`),
  { label: `resolve:${g.topic}`, phase: 'Resolve', schema: RESOLVED, ...TIER.resolve })

  const check = async (r, g) => {
    if (!r) return g.items.map(it => ({ n: it.n, outcome: null }))
    const ids = r.items.filter(x => x.outcome === 'folded' && x.id).map(x => x.id)
    const v = await verifyTopic(g.topic, ids, null)
    return r.items.map(x => {
      if (x.outcome !== 'folded') return { ...x, topic: g.topic }
      if (!v) return { n: x.n, outcome: null }
      const verdict = v.verdicts.find(y => y.id === x.id)
      if (verdict && verdict.verdict === 'cut') {
        return { ...x, topic: g.topic, outcome: 'rejected', reason: `cut in verification: ${verdict.reason}` }
      }
      return { ...x, topic: g.topic }
    })
  }

  phase('Resolve')
  const results = (await pipeline(groups, research, check))
    .flatMap((r, i) => r || groups[i].items.map(it => ({ n: it.n, outcome: null })))
  const open = results.filter(r => r.outcome === null).length
  if (open) log(`${open} items left unresolved; rerun --verify to retry them`)

  phase('Assemble')
  const [summary] = await assemble([])
  return { mode, items: results, summary }
}
