const { test, expect } = require('playwright/test');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const controllerSource = fs.readFileSync(path.join(repoRoot, 'assets/js/resource-controller.js'), 'utf8');
const publisherSource = fs.readFileSync(path.join(repoRoot, 'tools/resource-publisher/resource-publisher.js'), 'utf8');
const payload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'assets/data/resources.json'), 'utf8'));
const pages = [
  'pages/LandingPage.html',
  'pages/learn/LearnAI.html',
  'pages/challenges/Challenges.html',
  'pages/community/Community.html',
  'pages/learn/learn-library.html',
  'pages/challenges/challenge-library.html',
  'pages/community/community-library.html'
];
const runtimeUrl = 'https://willcrook.github.io/GenAI-Hub/assets/js/resource-controller.js';
const dataUrl = 'https://willcrook.github.io/GenAI-Hub/assets/data/resources.json';

function pageSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    .replace(runtimeUrl, 'http://hub.test/controller.js');
}

function payloadWithLink() {
  const copy = JSON.parse(JSON.stringify(payload));
  copy.resources.push({
    id: 'link-university-guidance', type: 'link', title: 'University guidance',
    summary: 'Read the University guidance for responsible generative AI use.',
    author: { name: 'GenAI Hub team', organisation: 'University of Bath', course: '', yearOfStudy: '' },
    datePublished: '2026-01-01', dateUpdated: '2026-07-21', librarySection: 'learn-ai',
    skillAreas: ['academic'], tags: ['guidance'], featured: false, mainCarousel: false, published: true,
    estimatedMinutes: null, thumbnail: { src: '', alt: '' },
    content: { url: 'https://www.bath.ac.uk/guides/using-generative-ai-tools/', siteName: 'University of Bath', description: 'Official guidance for staff and students.' }
  });
  return copy;
}

function payloadWithManyCommunity() {
  const copy = payloadWithLink();
  const source = copy.resources.find(resource => resource.type === 'prompt');
  for (let index = 1; index <= 5; index += 1) {
    const resource = JSON.parse(JSON.stringify(source));
    resource.id = 'prompt-extra-' + index;
    resource.title = 'Extra prompt ' + index;
    resource.featured = false;
    copy.resources.push(resource);
  }
  return copy;
}

function payloadWithCarouselCount(count) {
  const copy = payloadWithLink();
  copy.resources.forEach(resource => { resource.mainCarousel = false; });
  const source = copy.resources.find(resource => resource.type === 'prompt');
  while (copy.resources.length < count) {
    const resource = JSON.parse(JSON.stringify(source));
    resource.id = 'carousel-extra-' + copy.resources.length;
    resource.title = 'Carousel resource ' + copy.resources.length;
    copy.resources.push(resource);
  }
  copy.resources.slice(0, count).forEach((resource, index) => {
    resource.mainCarousel = true;
    const day = String((index % 28) + 1).padStart(2, '0');
    resource.dateUpdated = '2026-06-' + day;
    resource.datePublished = '2026-05-' + day;
  });
  return copy;
}

function publisherWorkbookFixture() {
  const shared = ['id','title','summary','author_name','author_organisation','author_course','author_year_of_study','date_published','date_updated','library_section','skill_areas','tags','featured','main_carousel','published','estimated_minutes','thumbnail_src','thumbnail_alt'];
  const definitions = {
    prompt: ['Prompts',['purpose','prompt_text','platforms','models_tested','reasoning_mode','usage_notes']],
    workflow: ['Workflows',['goal','reflection','estimated_total_minutes','complexity_score']],
    tool: ['Tools',['company','tool_url','rating','overview','strengths','weaknesses','pricing_model','cost','platform_types','accessibility_notes','privacy_notes','review_verdict']],
    article: ['Articles',['body','reading_time_minutes','source_url']],
    video: ['Videos',['provider','video_url','embed_url','duration_seconds']],
    link: ['Links',['url','site_name','description']],
    download: ['Downloads',['file_url','file_name','file_format','file_size_bytes','version','description']],
    event: ['Events',['host','start_date_time','end_date_time','timezone','location_type','location','online_url','description','capacity','booking_url','booking_required']],
    showcase: ['Showcases',['problem','approach','outcome','reflection','tools_used','project_url']]
  };
  const workbookPayload = payloadWithLink();
  workbookPayload.resources.find(resource => resource.type === 'link').published = false;
  const values = resource => {
    const content = resource.content;
    return {
      id: resource.id, title: resource.title, summary: resource.summary,
      author_name: resource.author.name, author_organisation: resource.author.organisation,
      author_course: resource.author.course, author_year_of_study: resource.author.yearOfStudy,
      date_published: resource.datePublished, date_updated: resource.dateUpdated,
      library_section: resource.librarySection, skill_areas: resource.skillAreas.join('|'), tags: resource.tags.join('|'),
      featured: resource.featured, main_carousel: resource.mainCarousel, published: resource.published, estimated_minutes: resource.estimatedMinutes,
      thumbnail_src: resource.thumbnail.src, thumbnail_alt: resource.thumbnail.alt,
      purpose: content.purpose, prompt_text: content.promptText, platforms: content.platforms && content.platforms.join('|'),
      models_tested: content.modelsTested && content.modelsTested.join('|'), reasoning_mode: content.reasoningMode, usage_notes: content.usageNotes,
      goal: content.goal, reflection: content.reflection, estimated_total_minutes: content.estimatedTotalMinutes, complexity_score: content.complexityScore,
      company: content.company, tool_url: content.toolUrl, rating: content.rating, overview: content.overview,
      strengths: content.strengths && content.strengths.join('|'), weaknesses: content.weaknesses && content.weaknesses.join('|'),
      pricing_model: content.pricing && content.pricing.model, cost: content.pricing && content.pricing.cost,
      platform_types: content.platformTypes && content.platformTypes.join('|'), accessibility_notes: content.accessibilityNotes,
      privacy_notes: content.privacyNotes, review_verdict: content.reviewVerdict,
      body: content.body, reading_time_minutes: content.readingTimeMinutes, source_url: content.sourceUrl,
      provider: content.provider, video_url: content.videoUrl, embed_url: content.embedUrl, duration_seconds: content.durationSeconds,
      url: content.url, site_name: content.siteName, description: content.description,
      file_url: content.fileUrl, file_name: content.fileName, file_format: content.fileFormat, file_size_bytes: content.fileSizeBytes, version: content.version,
      host: content.host, start_date_time: content.startDateTime, end_date_time: content.endDateTime, timezone: content.timezone,
      location_type: content.locationType, location: content.location, online_url: content.onlineUrl, capacity: content.capacity,
      booking_url: content.bookingUrl, booking_required: content.bookingRequired,
      problem: content.problem, approach: content.approach, outcome: content.outcome,
      tools_used: content.toolsUsed && content.toolsUsed.join('|'), project_url: content.projectUrl
    };
  };
  const Sheets = {};
  for (const [type, [sheet, extra]] of Object.entries(definitions)) {
    const headers = shared.concat(extra);
    const rows = workbookPayload.resources.filter(resource => resource.type === type).map(resource => {
      const row = values(resource);
      return headers.map(header => row[header] === undefined || row[header] === null ? '' : row[header]);
    });
    Sheets[sheet] = { matrix: [headers].concat(rows) };
  }
  const stepHeaders = ['workflow_id','step_number','title','description'];
  Sheets['Workflow Steps'] = { matrix: [stepHeaders].concat(workbookPayload.resources.filter(resource => resource.type === 'workflow').flatMap(resource => resource.content.steps.map(step => [resource.id,step.stepNumber,step.title,step.description]))) };
  Sheets['Validation Lists'] = { matrix: [
    ['library_sections','skill_areas','boolean_values','reasoning_modes','pricing_models','platform_types','location_types','ratings'],
    ['learn-ai','academic','TRUE','standard','free','web','in-person',1],
    ['challenges','workplace','FALSE','reasoning','freemium','desktop','online',1.5],
    ['community','lifelong','','either','paid','mobile','hybrid',2],
    ['','','','not-applicable','university-provided','browser-extension','',2.5],
    ['','','','','unknown','API','',3],
    ['','','','','','','',3.5],
    ['','','','','','','',4],
    ['','','','','','','',4.5],
    ['','','','','','','',5]
  ] };
  Sheets.Settings = { matrix: [['key','value'],['schema_version','1.2'],['site_name','GenAI Hub'],['output_filename','resources.json'],['multi_value_separator','|'],['default_timezone','Europe/London']] };
  return { Sheets };
}

async function openPage(page, relativePath, options = {}) {
  const body = pageSource(relativePath);
  let requests = 0;
  await page.unroute('http://hub.test/controller.js');
  await page.unroute(dataUrl);
  await page.unroute('http://hub.test/page*');
  await page.route('http://hub.test/controller.js', route => route.fulfill({ contentType: 'application/javascript', body: controllerSource }));
  await page.route(dataUrl, route => {
    requests += 1;
    if (options.endpoint) return options.endpoint(route, requests);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(options.payload || payloadWithLink()) });
  });
  await page.route('http://hub.test/page*', route => route.fulfill({ contentType: 'text/html', body }));
  await page.goto('http://hub.test/page' + (options.query || ''), { waitUntil: 'domcontentloaded' });
  return { requests: () => requests };
}

async function openWithoutController(page, relativePath) {
  const body = pageSource(relativePath);
  await page.unroute('http://hub.test/controller.js');
  await page.unroute('http://hub.test/page*');
  await page.route('http://hub.test/controller.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('http://hub.test/page*', route => route.fulfill({ contentType: 'text/html', body }));
  await page.goto('http://hub.test/page', { waitUntil: 'domcontentloaded' });
}

async function openPublisher(page, workbook) {
  await page.addInitScript(input => {
    window.XLSX = {
      read() { return input; },
      utils: { sheet_to_json(sheet) { return sheet.matrix.map(row => row.slice()); } },
      SSF: { parse_date_code() { return null; } }
    };
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value(blob) { window.__publisherBlob = blob; return 'blob:publisher-test'; } });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value() {} });
    document.addEventListener('click', event => { if (event.target.closest && event.target.closest('a[download]')) event.preventDefault(); }, true);
  }, workbook);
  await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://moodle.bath.ac.uk/pluginfile.php/**/resource-publisher.js*', route => route.fulfill({ contentType: 'application/javascript', body: publisherSource }));
  await page.route('http://publisher.test/page', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(repoRoot, 'tools/resource-publisher/resource-publisher.html'), 'utf8') }));
  await page.goto('http://publisher.test/page', { waitUntil: 'domcontentloaded' });
}

test('all seven pages use one consolidated resource dependency and obsolete controllers are removed', () => {
  for (const relativePath of pages) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    expect((source.match(/<script[^>]+src="[^"]*assets\/js\/resource-controller\.js"[^>]*><\/script>/g) || []).length, relativePath).toBe(1);
    expect(source).not.toMatch(/resource-loader|(?:learn-ai|challenges|community)-(?:featured|library)-controller/);
  }
  for (const name of ['resource-loader.js','learn-ai-featured-controller.js','learn-ai-library-controller.js','challenges-featured-controller.js','challenges-library-controller.js','community-featured-controller.js','community-library-controller.js']) {
    expect(fs.existsSync(path.join(repoRoot, 'assets/js', name)), name).toBe(false);
  }
  expect(payload.schemaVersion).toBe('1.2');
  expect(payload.resources.every(resource => Object.prototype.hasOwnProperty.call(resource, 'estimatedMinutes'))).toBe(true);
  expect(payload.resources.every(resource => typeof resource.mainCarousel === 'boolean')).toBe(true);
});

test('resource surfaces contain no hard-coded cards before the controller loads', async ({ page }) => {
  for (const [relativePath, selector] of [
    ['pages/learn/LearnAI.html', '[data-resource-featured-track]'],
    ['pages/challenges/Challenges.html', '[data-resource-featured-track]'],
    ['pages/learn/learn-library.html', '[data-resource-target="results"]'],
    ['pages/challenges/challenge-library.html', '[data-resource-target="results"]'],
    ['pages/community/community-library.html', '[data-resource-target="results"]']
  ]) {
    await openWithoutController(page, relativePath);
    await expect(page.locator(selector), relativePath).toBeEmpty();
  }

  for (const relativePath of ['pages/learn/LearnAI.html', 'pages/challenges/Challenges.html']) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    expect(source, relativePath).not.toMatch(/featuredCards|function createCard|track\.innerHTML/);
  }

  await openWithoutController(page, 'pages/community/Community.html');
  const ordinarySlots = page.locator('[data-resource-target] [data-hover-card="true"]');
  const featuredEventSlot = page.locator('#community-events .row > .col-lg-4 > a');
  await expect(ordinarySlots).toHaveCount(25);
  await expect(featuredEventSlot).toHaveCount(1);
  const slotStates = await ordinarySlots.evaluateAll(slots => slots.map(slot => ({
    children: slot.childElementCount,
    text: slot.textContent.trim(),
    href: slot.hasAttribute('href')
  })));
  const featuredEventState = await featuredEventSlot.evaluate(slot => ({
    children: slot.childElementCount,
    text: slot.textContent.trim(),
    href: slot.hasAttribute('href')
  }));
  expect(slotStates.concat(featuredEventState).every(slot => slot.children === 0 && slot.text === '' && slot.href === false)).toBe(true);
});

test('public API loads once and enforces library queries', async ({ page }) => {
  const opened = await openPage(page, 'pages/learn/learn-library.html');
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(3);
  const result = await page.evaluate(async () => {
    await window.GenAIHub.resources.load();
    await window.GenAIHub.resources.load();
    return {
      status: window.GenAIHub.resources.getState().status,
      learn: window.GenAIHub.resources.query({ librarySection: 'learn-ai' }).map(resource => resource.type),
      community: window.GenAIHub.resources.query({ librarySection: 'community' }).map(resource => resource.type),
      immutable: Object.isFrozen(window.GenAIHub.resources.query({})) &&
        Object.isFrozen(window.GenAIHub.resources.getById('article-check-ai-output')) &&
        Object.isFrozen(window.GenAIHub.resources.getState()) &&
        Object.isFrozen(window.GenAIHub.resources.getState().resources),
      az: window.GenAIHub.resources.query({ librarySection: 'learn-ai', sort: 'az' }).map(resource => resource.title),
      newest: window.GenAIHub.resources.query({ librarySection: 'learn-ai', sort: 'newest' }).map(resource => resource.datePublished)
    };
  });
  expect(opened.requests()).toBe(1);
  expect(result.status).toBe('ready');
  expect(result.learn.sort()).toEqual(['article','link','video']);
  expect(result.community.sort()).toEqual(['event','event','event','prompt','showcase','tool','workflow'].sort());
  expect(result.immutable).toBe(true);
  expect(result.az).toEqual(result.az.slice().sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' })));
  expect(result.newest).toEqual(result.newest.slice().sort().reverse());
});

test('community type and skill filters round-trip through Moodle-safe query parameters', async ({ page }) => {
  await openPage(page, 'pages/community/community-library.html', { query: '?id=1573033&course=keep&type=events&skill=invalid&time=wrong&sort=bad' });
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(3);
  await page.locator('[data-resource-type="prompt"]').click();
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('id')).toBe('1573033');
  expect(new URL(page.url()).searchParams.get('course')).toBe('keep');
  expect(new URL(page.url()).searchParams.get('type')).toBe('prompts');
  expect(new URL(page.url()).searchParams.has('time')).toBe(false);
  expect(new URL(page.url()).searchParams.has('sort')).toBe(false);
  await page.locator('label[for="resource-category-workplace"]').click();
  await expect(page.locator('[data-resource-empty]')).toBeVisible();
  expect(new URL(page.url()).searchParams.getAll('skill')).toEqual(['workplace']);
});

test('Learn AI combines media type, time, search and sorting controls', async ({ page }) => {
  await openPage(page, 'pages/learn/learn-library.html', { query: '?id=1573031&type=videos&time=under-10' });
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(1);
  await expect(page.locator('[data-resource-type="video"]')).toBeChecked();
  await page.locator('[data-resource-reset]').first().click();
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(3);
  await page.locator('label[for="learn-time-under-10"]').click();
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(2);
  await page.locator('[data-resource-reset]').first().click();
  await page.locator('[data-resource-search]').fill('checklist');
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(1);
  await page.locator('[data-resource-sort]').selectOption('az');
  expect(new URL(page.url()).searchParams.get('sort')).toBe('az');
});

test('all nine resource types open type-specific accessible popouts', async ({ page }) => {
  await page.addInitScript(() => {
    window.__copiedPrompt = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText(value) { window.__copiedPrompt = value; return Promise.resolve(); } } });
  });
  for (const [relativePath, types] of [
    ['pages/learn/learn-library.html', ['article','video','link']],
    ['pages/challenges/challenge-library.html', ['download']],
    ['pages/community/community-library.html', ['prompt','workflow','tool','event','showcase']]
  ]) {
    await openPage(page, relativePath);
    await page.evaluate(() => window.GenAIHub.resources.ready);
    for (const type of types) {
      const id = await page.evaluate(typeName => window.GenAIHub.resources.query({ types: [typeName] })[0].id, type);
      const trigger = page.locator('[data-resource-open="' + id + '"]').first();
      await trigger.click();
      const dialog = page.locator('[role="dialog"][data-resource-popout="' + type + '"]');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-resource-popout-close]')).toBeFocused();
      const hrefs = await dialog.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs.every(href => /^https?:/.test(href))).toBe(true);
      if (type === 'prompt') {
        await dialog.getByRole('button', { name: 'Copy prompt' }).click();
        expect(await page.evaluate(() => window.__copiedPrompt.length)).toBeGreaterThan(0);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  }
});

test('dialog traps focus and closes through its button and backdrop with focus restoration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPage(page, 'pages/learn/learn-library.html');
  const trigger = page.locator('[data-resource-open="article-check-ai-output"]').first();
  await trigger.click();
  const dialog = page.locator('[role="dialog"]');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('[role="dialog"]')))).toBe(true);
  await dialog.locator('[data-resource-popout-close]').click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('[data-resource-popout-backdrop]').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('library renders nine-result batches and Load more reveals the remainder', async ({ page }) => {
  await openPage(page, 'pages/community/community-library.html', { payload: payloadWithManyCommunity() });
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(9);
  await page.locator('[data-resource-load-more]').click();
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(12);
  await expect(page.locator('[data-resource-load-more]')).toBeHidden();
});

test('runtime does not duplicate publisher taxonomy, skill-count or rating rules', async ({ page }) => {
  const invalid = payloadWithLink();
  invalid.resources.find(resource => resource.type === 'prompt').librarySection = 'learn-ai';
  invalid.resources.find(resource => resource.type === 'prompt').skillAreas = ['academic','lifelong'];
  invalid.resources.find(resource => resource.type === 'tool').skillAreas = ['workplace'];
  invalid.resources.find(resource => resource.type === 'tool').content.rating = 4.55;
  await openPage(page, 'pages/community/community-library.html', { payload: invalid });
  await expect(page.locator('[data-resource-error]')).toBeHidden();
  expect(await page.evaluate(async () => {
    await window.GenAIHub.resources.ready;
    return ['prompt-critical-reading','tool-microsoft-copilot'].every(id => Boolean(window.GenAIHub.resources.getById(id)));
  })).toBe(true);
});

test('runtime skips malformed or duplicate records and continues with valid resources', async ({ page }) => {
  const mixed = payloadWithLink();
  mixed.resources.find(resource => resource.type === 'prompt').content.platforms = 'not-an-array';
  mixed.resources.find(resource => resource.type === 'link').content.url = 'javascript:alert(1)';
  mixed.resources.push(JSON.parse(JSON.stringify(mixed.resources.find(resource => resource.type === 'article'))));
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await openPage(page, 'pages/learn/learn-library.html', { payload: mixed });
  await expect(page.locator('[data-resource-error]')).toBeHidden();
  const state = await page.evaluate(async () => {
    await window.GenAIHub.resources.ready;
    return {
      prompt: window.GenAIHub.resources.getById('prompt-critical-reading'),
      link: window.GenAIHub.resources.getById('link-university-guidance'),
      articleCount: window.GenAIHub.resources.query({ types: ['article'] }).length,
      status: window.GenAIHub.resources.getState().status
    };
  });
  expect(state.prompt).toBeNull();
  expect(state.link).toBeNull();
  expect(state.articleCount).toBe(1);
  expect(state.status).toBe('ready');
  expect(warnings.some(message => message.includes('resources[') && message.includes('prompt-critical-reading'))).toBe(true);
  expect(warnings.some(message => message.includes('javascript') || message.includes('url must be'))).toBe(true);
  expect(warnings.some(message => message.includes('duplicate resource id'))).toBe(true);
});

test('runtime rejects invalid envelopes and non-empty payloads with no usable records', async ({ page }) => {
  const invalidEnvelope = payloadWithLink();
  invalidEnvelope.resources = {};
  await openPage(page, 'pages/learn/learn-library.html', { payload: invalidEnvelope });
  await expect(page.locator('[data-resource-error-message]')).toContainText('resources');

  const noUsable = payloadWithLink();
  noUsable.resources = [{ id: 'broken', type: 'unknown' }];
  await openPage(page, 'pages/learn/learn-library.html', { payload: noUsable });
  await expect(page.locator('[data-resource-error-message]')).toContainText('no usable resource records');

  const empty = payloadWithLink();
  empty.resources = [];
  await openPage(page, 'pages/learn/learn-library.html', { payload: empty });
  await expect(page.locator('[data-resource-error]')).toBeHidden();
  await expect(page.locator('[data-resource-empty]')).toBeVisible();
});

test('featured carousels use seven Coming soon slots before their technical loop copy', async ({ page }) => {
  await openPage(page, 'pages/learn/LearnAI.html');
  await expect(page.locator('[data-resource-featured-track] [data-resource-id]').first()).toBeVisible();
  await expect(page.locator('[data-resource-featured-track] [data-resource-id]')).toHaveCount(2);
  await expect(page.locator('[data-resource-featured-track] [data-resource-placeholder]')).toHaveCount(14);
  await expect(page.locator('[data-resource-featured-track] [data-resource-placeholder][data-resource-clone]')).toHaveCount(7);
  expect(await page.locator('[data-resource-featured-track] [data-resource-clone]:not([aria-hidden="true"])').count()).toBe(0);
  await expect(page.locator('[data-resource-featured-track] [data-resource-open]:not([tabindex="-1"])')).toHaveCount(1);
  await expect(page.locator('[data-resource-featured-track] [data-resource-open]:not([data-resource-clone]) .badge')).toHaveCount(1);
  await openPage(page, 'pages/challenges/Challenges.html');
  const featuredChallengeCount = payload.resources.filter(resource => resource.librarySection === 'challenges' && resource.featured).length * 2;
  await expect(page.locator('[data-resource-featured-track] [data-resource-id]')).toHaveCount(featuredChallengeCount);
  await expect(page.locator('[data-resource-featured-track] [data-resource-placeholder]')).toHaveCount(14);
  await expect(page.locator('[data-resource-featured-track]')).not.toContainText('No featured resources are available yet.');
});

test('featured carousel cards show the shared project-image placeholder only when a thumbnail is missing', async ({ page }) => {
  const learnResourceId = 'article-check-ai-output';
  const learnTitle = 'A practical AI output checklist';
  const learnCard = page.locator('[data-resource-id="' + learnResourceId + '"]:not([data-resource-clone]) [data-resource-open]');
  const learnPlaceholder = '[data-resource-id="' + learnResourceId + '"] [role="img"][aria-label="Project image coming soon for ' + learnTitle + '"]';

  await openPage(page, 'pages/learn/LearnAI.html');
  await expect(page.locator(learnPlaceholder)).toHaveCount(2);
  await expect(page.locator(learnPlaceholder).first()).toContainText('Project image coming soon');
  await expect(page.locator(learnPlaceholder).first()).toContainText('No image has been provided yet.');
  expect(await learnCard.evaluate(card => {
    const children = Array.from(card.children);
    const summary = children.find(child => child.matches('p.text-muted'));
    const media = children.find(child => child.querySelector('[role="img"]'));
    const authorship = children.find(child => child.matches('p.small.font-weight-bold'));
    return summary && media && authorship && children.indexOf(summary) < children.indexOf(media) && children.indexOf(media) < children.indexOf(authorship);
  })).toBe(true);

  const challengeResourceId = 'download-prompt-planner';
  await openPage(page, 'pages/challenges/Challenges.html');
  await expect(page.locator('[data-resource-id="' + challengeResourceId + '"] img')).toHaveCount(2);
  await expect(page.locator('[data-resource-id="' + challengeResourceId + '"] [role="img"]')).toHaveCount(0);

  const missingChallengeThumbnail = payloadWithLink();
  const challengeResource = missingChallengeThumbnail.resources.find(resource => resource.id === challengeResourceId);
  challengeResource.thumbnail = { src: '', alt: '' };
  await openPage(page, 'pages/challenges/Challenges.html', { payload: missingChallengeThumbnail });
  await expect(page.locator('[data-resource-id="' + challengeResourceId + '"] [role="img"][aria-label="Project image coming soon for Prompt planning worksheet"]')).toHaveCount(2);
  await expect(page.locator('[data-resource-id="' + challengeResourceId + '"] img')).toHaveCount(0);
});

test('Landing Page carousel sorts selected resources, fills to ten and has no upper limit', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const count of [0, 3, 10, 12, 25]) {
    await openPage(page, 'pages/LandingPage.html', { payload: payloadWithCarouselCount(count) });
    const expectedStates = Math.max(10, count);
    await expect(page.locator('[data-hub-bottom-original-index]')).toHaveCount(expectedStates);
    await expect(page.locator('[data-hub-dot]')).toHaveCount(expectedStates);
    await expect(page.locator('[data-hub-original-index]')).toHaveCount(5);
    expect(await page.locator('#genaiHubCarousel').getAttribute('data-main-carousel-resources')).toBe(String(count));
    expect(await page.locator('#genaiHubCarousel').getAttribute('data-main-carousel-placeholders')).toBe(String(Math.max(0, 10 - count)));
    const originalPlaceholders = page.locator('[data-hub-bottom-original-index][data-resource-placeholder]');
    await expect(originalPlaceholders).toHaveCount(Math.max(0, 10 - count));
    const updatedDates = await page.locator('[data-hub-bottom-original-index][data-resource-id]').evaluateAll(cards => cards.map(card => window.GenAIHub.resources.getById(card.getAttribute('data-resource-id')).dateUpdated));
    expect(updatedDates).toEqual(updatedDates.slice().sort().reverse());
  }

  const upperHrefs = await page.locator('[data-hub-original-index] a').evaluateAll(links => links.map(link => link.href));
  expect(upperHrefs).toEqual([
    'https://moodle.bath.ac.uk/mod/page/view.php?id=1567967',
    'https://moodle.bath.ac.uk/mod/page/view.php?id=1567969',
    'https://moodle.bath.ac.uk/mod/page/view.php?id=1567971',
    'https://moodle.bath.ac.uk/mod/page/view.php?id=1567972',
    'https://moodle.bath.ac.uk/mod/page/view.php?id=1567971'
  ]);
  await expect(page.locator('[data-hub-original-index="4"]')).toContainText('Community events');
  await expect(page.locator('[data-hub-original-index="4"]')).toHaveAttribute('aria-label', '5 of 5: Workshops & meetups');

  const headingColours = await page.locator('[data-hub-bottom-original-index][data-resource-id]').evaluateAll(cards => Object.fromEntries(cards.map(card => [
    card.getAttribute('data-resource-id'),
    getComputedStyle(card.querySelector('h4')).color
  ])));
  expect(headingColours['article-check-ai-output']).toBe('rgb(21, 128, 61)');
  expect(headingColours['event-online-clinic']).toBe('rgb(37, 99, 235)');
  expect(headingColours['video-ai-foundations']).toBe('rgb(124, 58, 237)');
  expect(headingColours['tool-microsoft-copilot']).toBe('rgb(9, 70, 133)');

  const openerCard = page.locator('[data-hub-bottom-original-index][data-resource-id="tool-microsoft-copilot"]');
  await page.locator('[data-hub-dot="' + await openerCard.getAttribute('data-hub-bottom-original-index') + '"]').click();
  const opener = openerCard.locator('[data-resource-open]');
  expect(await page.evaluate(() => Boolean(window.GenAIHub.resources.getById('tool-microsoft-copilot')))).toBe(true);
  await opener.click();
  expect(page.url()).toBe('http://hub.test/page');
  await expect(page.locator('[role="dialog"]')).toContainText('Microsoft Copilot');
  await page.locator('[data-resource-popout-close]').click();
  await expect(opener).toBeFocused();

  await openPage(page, 'pages/LandingPage.html', { payload: payloadWithCarouselCount(12) });
  await page.locator('[data-hub-dot="11"]').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-hub-dot="0"]')).toHaveAttribute('aria-current', 'true');

  const bottomViewport = page.locator('#genaiHubBottomTrack').locator('..');
  await bottomViewport.hover({ position: { x: 120, y: 90 } });
  await page.mouse.wheel(100, 0);
  await expect(page.locator('[data-hub-dot="1"]')).toHaveAttribute('aria-current', 'true');
  await bottomViewport.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: 220, clientY: 90 });
  await bottomViewport.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: 120, clientY: 90 });
  await expect(page.locator('[data-hub-dot="2"]')).toHaveAttribute('aria-current', 'true');
});

test('Landing Page carousel autoplay can be paused and resumed', async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openPage(page, 'pages/LandingPage.html', { payload: payloadWithCarouselCount(12) });
  await expect(page.locator('[data-hub-dot="0"]')).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(5400);
  await expect(page.locator('[data-hub-dot="1"]')).toHaveAttribute('aria-current', 'true');

  const pause = page.locator('[data-hub-pause]');
  await pause.click({ force: true });
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(5400);
  await expect(page.locator('[data-hub-dot="1"]')).toHaveAttribute('aria-current', 'true');

  await pause.click({ force: true });
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(5400);
  await expect(page.locator('[data-hub-dot="2"]')).toHaveAttribute('aria-current', 'true');
});

test('Landing Page keeps its ten-card static fallback when resource loading fails', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPage(page, 'pages/LandingPage.html', { endpoint: route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) });
  await expect(page.locator('[data-hub-bottom-original-index]')).toHaveCount(10);
  await expect(page.locator('[data-hub-dot]')).toHaveCount(10);
  await expect(page.locator('#genaiHubCarousel')).not.toHaveAttribute('data-main-carousel-resources', /.+/);
});

test('Community restores type-specific cards, fills unused slots and runs the real event countdown', async ({ page }) => {
  await openPage(page, 'pages/community/Community.html');
  await expect(page.locator('[data-resource-target] [data-resource-id]')).toHaveCount(7);
  await expect(page.locator('[data-resource-target] [data-resource-placeholder]')).toHaveCount(19);
  const communityActionCount = payload.resources.filter(resource => resource.librarySection === 'community' && resource.type !== 'tool').length;
  await expect(page.locator('[data-resource-open] .fa-arrow-up-right-from-square')).toHaveCount(communityActionCount);
  await expect(page.locator('#student-showcase')).toContainText('View Work');
  await expect(page.locator('#prompt-library')).toContainText('Use Prompt');
  await expect(page.locator('#workflow-library')).toContainText('View Workflow');
  await expect(page.locator('#community-events')).toContainText('View Event');
  await expect(page.locator('#tool-reviews [data-resource-open] .badge')).toHaveCount(0);
  await expect(page.locator('#tool-reviews [data-resource-open]')).toContainText('4.5/5');
  await expect(page.locator('body')).not.toContainText('AI Study Coach Prototype');
  await expect(page.locator('body')).not.toContainText('Socratic Revision Partner');
  await expect(page.locator('body')).not.toContainText('NotebookLM');
  const skillCounts = await page.locator('[data-resource-target]:not([data-resource-target="tool"]) [data-resource-id]').evaluateAll(cards => cards.map(card => card.querySelectorAll('.badge').length));
  expect(skillCounts.every(count => count === 1)).toBe(true);
  const lead = page.locator('#community-events .row > .col-lg-4 > a');
  await expect(lead).toContainText('Next up');
  await expect(lead).toContainText('Event starts in');
  await expect(lead.locator('[aria-live="polite"]')).toContainText(/\d+d \d{2}h \d{2}m \d{2}s|Happening now|Event has ended/);
  const colours = await lead.evaluate(card => ({ title: getComputedStyle(card.querySelector('h3')).color, summary: getComputedStyle(card.querySelector('p')).color }));
  expect(colours.title).toBe('rgb(255, 255, 255)');
  expect(colours.summary).toBe('rgb(230, 238, 248)');
});

test('resource popouts retain rich free-form tags while tool cards omit skill badges', async ({ page }) => {
  await openPage(page, 'pages/community/community-library.html');
  const tool = page.locator('[data-resource-open="tool-microsoft-copilot"]').first();
  await expect(tool).toContainText('Tool review');
  await expect(tool).not.toContainText('Academic');
  await expect(tool).not.toContainText('Workplace');
  await expect(tool).not.toContainText('Lifelong');
  await tool.click();
  await expect(page.locator('[role="dialog"]')).toContainText('assistant');
  await expect(page.locator('[role="dialog"]')).toContainText('Productivity');
  await page.locator('[data-resource-popout-close]').click();
  await openPage(page, 'pages/learn/learn-library.html');
  const article = page.locator('[data-resource-open="article-check-ai-output"]').first();
  await expect(article).toContainText('Article');
  await expect(article).toContainText('Academic');
  await article.click();
  await expect(page.locator('[role="dialog"]')).toContainText('Verification');
  await expect(page.locator('[role="dialog"]')).toContainText('Responsible use');
});

test('failed loads expose a Retry action and a newer request replaces the failure', async ({ page }) => {
  let fail = true;
  await openPage(page, 'pages/learn/learn-library.html', {
    endpoint: route => fail
      ? (fail = false, route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
      : route.fulfill({ contentType: 'application/json', body: JSON.stringify(payloadWithLink()) })
  });
  await expect(page.locator('[data-resource-error]')).toBeVisible();
  await page.locator('[data-resource-retry]').click();
  await expect(page.locator('[data-resource-results] [data-resource-id]')).toHaveCount(3);
});

test('a slower stale request cannot overwrite a newer reload', async ({ page }) => {
  const oldPayload = payloadWithLink();
  const newPayload = payloadWithLink();
  newPayload.resources.find(resource => resource.id === 'article-check-ai-output').title = 'Newer resource title';
  const opened = await openPage(page, 'pages/learn/learn-library.html', {
    endpoint(route, requestNumber) {
      if (requestNumber > 1) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(newPayload) });
      return new Promise(resolve => setTimeout(() => {
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(oldPayload) }).catch(() => {}).finally(resolve);
      }, 150));
    }
  });
  await expect.poll(opened.requests).toBe(1);
  await page.evaluate(() => window.GenAIHub.resources.reload());
  await expect.poll(opened.requests).toBe(2);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.GenAIHub.resources.getById('article-check-ai-output').title)).toBe('Newer resource title');
});

test('browser publisher accepts schema 1.2 workbook data and exports typed JSON safely', async ({ page }) => {
  await openPublisher(page, publisherWorkbookFixture());
  await page.locator('#publisher-file').setInputFiles({ name: 'resource-database.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fixture') });
  await expect(page.locator('#publisher-status')).toContainText('Validation complete');
  await expect(page.locator('#publisher-download')).toBeEnabled();
  await page.locator('#publisher-download').click();
  const exported = await page.evaluate(async () => JSON.parse(await window.__publisherBlob.text()));
  expect(exported.schemaVersion).toBe('1.2');
  expect(exported.resources).toHaveLength(payload.resources.length);
  expect(exported.resources.some(resource => resource.type === 'link')).toBe(false);
  expect(exported.resources.every(resource => typeof resource.featured === 'boolean' && typeof resource.mainCarousel === 'boolean' && typeof resource.published === 'boolean')).toBe(true);
  expect(exported.resources.filter(resource => resource.mainCarousel)).toHaveLength(payload.resources.length);
  const expectedOrder = payload.resources.slice().sort((left, right) => right.dateUpdated.localeCompare(left.dateUpdated) || right.datePublished.localeCompare(left.datePublished) || left.id.localeCompare(right.id, 'en-GB', { sensitivity: 'base' })).map(resource => resource.id);
  expect(exported.resources.map(resource => resource.id)).toEqual(expectedOrder);
  await expect(page.locator('#publisher-export-summary')).toContainText('10 selected resources and 0 Coming soon placeholders');
  expect(exported.resources.find(resource => resource.type === 'workflow').estimatedMinutes).toBe(25);
  expect(exported.resources.filter(resource => resource.type === 'event').map(resource => resource.estimatedMinutes)).toEqual([90,120,60]);
  expect(exported.resources.find(resource => resource.type === 'tool').skillAreas).toEqual([]);
  expect(exported.resources.find(resource => resource.type === 'tool').content.rating).toBe(4.5);
});

test('browser publisher blocks cross-library taxonomy violations', async ({ page }) => {
  const workbook = publisherWorkbookFixture();
  workbook.Sheets.Prompts.matrix[1][9] = 'learn-ai';
  await openPublisher(page, workbook);
  await page.locator('#publisher-file').setInputFiles({ name: 'invalid-resource-database.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fixture') });
  await expect(page.locator('#publisher-status')).toContainText('blocking error');
  await expect(page.locator('#publisher-errors')).toContainText('prompt resources are not allowed in learn-ai');
  await expect(page.locator('#publisher-download')).toBeDisabled();
});

test('browser publisher enforces one skill, no tool skill and one-decimal ratings', async ({ page }) => {
  const workbook = publisherWorkbookFixture();
  workbook.Sheets.Prompts.matrix[1][10] = 'academic|lifelong';
  workbook.Sheets.Tools.matrix[1][10] = 'workplace';
  workbook.Sheets.Tools.matrix[1][20] = 4.55;
  await openPublisher(page, workbook);
  await page.locator('#publisher-file').setInputFiles({ name: 'invalid-skills-and-rating.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fixture') });
  await expect(page.locator('#publisher-errors')).toContainText('Enter exactly one skill area');
  await expect(page.locator('#publisher-errors')).toContainText('Tool reviews must leave skill_areas blank');
  await expect(page.locator('#publisher-errors')).toContainText('no more than one decimal place');
  await expect(page.locator('#publisher-download')).toBeDisabled();
});

test('browser publisher aggregates complete schema errors with workbook source locations', async ({ page }) => {
  const workbook = publisherWorkbookFixture();
  workbook.Sheets.Prompts.matrix[1][1] = '';
  workbook.Sheets.Prompts.matrix[1][16] = 'javascript:alert(1)';
  workbook.Sheets.Prompts.matrix[1][22] = 'unsupported-mode';
  workbook.Sheets.Events.matrix[1][19] = '2027-07-22T12:00:00Z';
  workbook.Sheets.Events.matrix[1][20] = '2027-07-22T11:00:00Z';
  const orphan = new Array(workbook.Sheets.Links.matrix[0].length).fill('');
  orphan[1] = 'Orphaned row';
  workbook.Sheets.Links.matrix.push(orphan);
  await openPublisher(page, workbook);
  await page.locator('#publisher-file').setInputFiles({ name: 'invalid-complete-schema.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fixture') });
  await expect(page.locator('#publisher-status')).toContainText('blocking errors');
  await expect(page.locator('#publisher-errors')).toContainText('Prompts — row 2 — title');
  await expect(page.locator('#publisher-errors')).toContainText('must not be empty');
  await expect(page.locator('#publisher-errors')).toContainText('unsupported-mode');
  await expect(page.locator('#publisher-errors')).toContainText('valid http or https URL');
  await expect(page.locator('#publisher-errors')).toContainText('must be later than startDateTime');
  await expect(page.locator('#publisher-errors')).toContainText('ID is required when any other cell in the row contains data');
  await expect(page.locator('#publisher-download')).toBeDisabled();
});

test('all seven JSON surfaces render without runtime errors or horizontal overflow at target widths', async ({ page }) => {
  const expectations = [
    ['pages/LandingPage.html', '[data-hub-bottom-original-index]', 10, false],
    ['pages/learn/LearnAI.html', '[data-resource-featured-track] [data-resource-id]', 1, true],
    ['pages/challenges/Challenges.html', '[data-resource-featured-track]', 1, false],
    ['pages/community/Community.html', '[data-resource-target] [data-resource-id]', 7, false],
    ['pages/learn/learn-library.html', '[data-resource-results] [data-resource-id]', 3, false],
    ['pages/challenges/challenge-library.html', '[data-resource-results] [data-resource-id]', 1, false],
    ['pages/community/community-library.html', '[data-resource-results] [data-resource-id]', 7, false]
  ];
  const errors = [];
  let current = '';
  page.on('pageerror', error => errors.push(current + ': ' + error.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [relativePath, selector, count, atLeast] of expectations) {
      current = relativePath + ' at ' + width;
      await openPage(page, relativePath);
      if (atLeast) await expect(page.locator(selector).first()).toBeVisible();
      else await expect(page.locator(selector)).toHaveCount(count);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        overflow: Array.from(document.querySelectorAll('body *')).map(element => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, id: element.id, className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
        }).filter(rect => rect.right > document.documentElement.clientWidth + 1 || rect.left < -1).slice(0, 12)
      }));
      expect(metrics.scrollWidth, current + ' ' + JSON.stringify(metrics.overflow)).toBeLessThanOrEqual(metrics.clientWidth);
    }
  }
  expect(errors).toEqual([]);
});
