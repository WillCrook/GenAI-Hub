(function () {
  'use strict';

  var SCHEMA_VERSION = '1.1';
  var SHARED = ['id','title','summary','author_name','author_organisation','author_course','author_year_of_study','date_published','date_updated','library_section','skill_areas','tags','featured','published','estimated_minutes','thumbnail_src','thumbnail_alt'];
  var DEFINITIONS = [
    {sheet:'Prompts',type:'prompt',extra:['purpose','prompt_text','platforms','models_tested','reasoning_mode','usage_notes']},
    {sheet:'Workflows',type:'workflow',extra:['goal','reflection','estimated_total_minutes','complexity_score']},
    {sheet:'Tools',type:'tool',extra:['company','tool_url','rating','overview','strengths','weaknesses','pricing_model','cost','platform_types','accessibility_notes','privacy_notes','review_verdict']},
    {sheet:'Articles',type:'article',extra:['body','reading_time_minutes','source_url']},
    {sheet:'Videos',type:'video',extra:['provider','video_url','embed_url','duration_seconds']},
    {sheet:'Links',type:'link',extra:['url','site_name','description']},
    {sheet:'Downloads',type:'download',extra:['file_url','file_name','file_format','file_size_bytes','version','description']},
    {sheet:'Events',type:'event',extra:['host','start_date_time','end_date_time','timezone','location_type','location','online_url','description','capacity','booking_url','booking_required']},
    {sheet:'Showcases',type:'showcase',extra:['problem','approach','outcome','reflection','tools_used','project_url']}
  ];
  var STEP_HEADERS = ['workflow_id','step_number','title','description'];
  var LIST_HEADERS = ['library_sections','skill_areas','boolean_values','reasoning_modes','pricing_models','platform_types','location_types','ratings'];
  var SETTINGS_HEADERS = ['key','value'];
  var ALLOWED = {
    library_section:['learn-ai','challenges','community'], skill_areas:['academic','workplace','lifelong'],
    reasoning_mode:['standard','reasoning','either','not-applicable'], pricing_model:['free','freemium','paid','institutional','unknown'],
    platform_types:['web','desktop','mobile','browser-extension','API'], location_type:['in-person','online','hybrid']
  };
  var LIST_VALUES = {
    library_sections:ALLOWED.library_section, skill_areas:ALLOWED.skill_areas, boolean_values:['TRUE','FALSE'],
    reasoning_modes:ALLOWED.reasoning_mode, pricing_models:ALLOWED.pricing_model,
    platform_types:ALLOWED.platform_types, location_types:ALLOWED.location_type,
    ratings:['1','1.5','2','2.5','3','3.5','4','4.5','5']
  };
  var TYPE_SECTIONS = {
    prompt:['community'],workflow:['community'],tool:['community'],event:['community'],showcase:['community'],
    article:['learn-ai','challenges'],video:['learn-ai','challenges'],link:['learn-ai','challenges'],download:['learn-ai','challenges']
  };
  var MULTI = ['skill_areas','tags','platforms','models_tested','strengths','weaknesses','platform_types','tools_used'];
  var URL_FIELDS = ['thumbnail_src','tool_url','source_url','video_url','embed_url','url','file_url','online_url','booking_url','project_url'];
  var NON_NEGATIVE = ['estimated_total_minutes','complexity_score','cost','reading_time_minutes','duration_seconds','file_size_bytes','capacity'];
  var INTEGER_FIELDS = ['reading_time_minutes','duration_seconds','file_size_bytes','capacity'];
  var ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var state = {resources:[],issues:[],settings:{},payload:null};
  var ui = {};

  function start() {
    ['file','file-name','drop-zone','library-error','status','empty','results','counts','errors','warnings','preview','preview-summary','type-filter','cards','export','export-summary','download'].forEach(function (name) { ui[name] = document.getElementById('publisher-' + name); });
    if (!window.XLSX) {
      ui['library-error'].textContent = 'The Excel reader could not be loaded from the SheetJS CDN. Check the network connection and Moodle content-security settings, then reload this page.';
      ui['library-error'].hidden = false; ui.file.disabled = true; return;
    }
    ui.file.addEventListener('change', function () { if (ui.file.files[0]) handleFile(ui.file.files[0]); });
    ['dragenter','dragover'].forEach(function (name) { ui['drop-zone'].addEventListener(name, function (event) { event.preventDefault(); ui['drop-zone'].style.borderColor = '#094685'; ui['drop-zone'].style.background = '#e8f0f8'; }); });
    ['dragleave','drop'].forEach(function (name) { ui['drop-zone'].addEventListener(name, function (event) { event.preventDefault(); ui['drop-zone'].style.borderColor = '#94a9bd'; ui['drop-zone'].style.background = '#f8fbfd'; }); });
    ui['drop-zone'].addEventListener('drop', function (event) { var file = event.dataTransfer && event.dataTransfer.files[0]; if (file) handleFile(file); });
    ui['type-filter'].addEventListener('change', renderPreview);
    ui.download.addEventListener('click', downloadJson);
    document.addEventListener('keydown', function (event) { if (event.key === 'Tab') document.body.classList.add('publisher-keyboard'); });
    document.getElementById('resource-publisher').addEventListener('focusin', function (event) { if (event.target.matches('a,button,input,select,summary')) event.target.style.outline='3px solid #f5c242'; });
    document.getElementById('resource-publisher').addEventListener('focusout', function (event) { if (event.target.matches('a,button,input,select,summary')) event.target.style.outline=''; });
  }

  function handleFile(file) {
    reset();
    ui['file-name'].textContent = file.name;
    if (!/\.xlsx$/i.test(file.name)) { fatal('Choose an .xlsx workbook.'); return; }
    status('Reading and validating ' + file.name + '…', 'info');
    file.arrayBuffer().then(function (bytes) {
      var workbook;
      try { workbook = window.XLSX.read(bytes, {type:'array',raw:true,cellDates:true}); }
      catch (error) { fatal('The workbook could not be read. It may be damaged or may not be a valid .xlsx file.'); return; }
      try { processWorkbook(workbook); }
      catch (error) { console.error(error); fatal('The workbook was read, but could not be processed safely. Check its structure and try again.'); }
    }).catch(function () { fatal('The selected file could not be read by this browser.'); });
  }

  function reset() { state={resources:[],issues:[],settings:{},payload:null}; clear(ui.counts); clear(ui.cards); ui.empty.hidden=false; ui.results.hidden=true; ui.preview.hidden=true; ui.export.hidden=true; ui.download.disabled=true; }
  function fatal(message) { addIssue('error','Workbook',1,'', '',message); renderAll(); status(message,'danger'); }
  function status(message, kind) { ui.status.className='alert alert-' + kind + ' mt-3 mb-0'; ui.status.textContent=message; }

  function processWorkbook(workbook) {
    validateWorkbookStructure(workbook);
    validateValidationLists(workbook);
    state.settings = parseSettings(workbook);
    if ((state.settings.schema_version || SCHEMA_VERSION) !== SCHEMA_VERSION) addIssue('error','Settings',2,'value','','schema_version must be ' + SCHEMA_VERSION + '.');
    var separator = state.settings.multi_value_separator || '|';
    DEFINITIONS.forEach(function (definition) {
      rowsFor(workbook,definition.sheet,SHARED.concat(definition.extra)).forEach(function (row) {
        var id=text(row.values.id), populated=Object.keys(row.values).some(function(key){return text(row.values[key])!=='';});
        if (!id) { if (populated) addIssue('error',definition.sheet,row.number,'id','','ID is required when any other cell in the row contains data.'); return; }
        validateRow(row,definition,separator,id);
        state.resources.push(buildResource(row,definition,separator));
      });
    });
    attachWorkflowSteps(workbook);
    state.payload=createPayload(state.resources,new Date().toISOString(),true);
    validatePayloadSchema(state.payload,state.resources);
    renderAll();
    var errors=state.issues.filter(function (issue) { return issue.severity==='error'; }).length;
    status(errors ? 'Validation finished with ' + errors + ' blocking error' + (errors===1?'':'s') + '.' : 'Validation complete. The JSON is ready to download.', errors?'danger':'success');
  }

  // Phase 1: validate workbook structure and raw authoring values.
  function validateWorkbookStructure(workbook) {
    var required=DEFINITIONS.map(function (d) { return d.sheet; }).concat(['Workflow Steps','Validation Lists','Settings']);
    required.forEach(function (sheet) { if (!workbook.Sheets[sheet]) addIssue('error',sheet,1,'','','Required sheet is missing.'); });
    DEFINITIONS.forEach(function (d) { checkHeaders(workbook,d.sheet,SHARED.concat(d.extra)); });
    checkHeaders(workbook,'Workflow Steps',STEP_HEADERS); checkHeaders(workbook,'Validation Lists',LIST_HEADERS); checkHeaders(workbook,'Settings',SETTINGS_HEADERS);
  }

  function validateValidationLists(workbook) {
    if (!workbook.Sheets['Validation Lists']) return;
    var rows=rowsFor(workbook,'Validation Lists',LIST_HEADERS);
    LIST_HEADERS.forEach(function(header){
      var actual=rows.map(function(row){return text(row.values[header]);}).filter(Boolean);
      var expected=LIST_VALUES[header];
      if (actual.length!==expected.length || actual.some(function(value,index){return value!==expected[index];})) {
        addIssue('error','Validation Lists',1,header,'','Validation list must contain exactly: ' + expected.join(', ') + '.');
      }
    });
  }

  function checkHeaders(workbook,sheetName,expected) {
    if (!workbook.Sheets[sheetName]) return;
    var matrix=window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:true,defval:''});
    var headers=(matrix[0]||[]).map(text), counts=Object.create(null);
    headers.forEach(function (header) { if (header) counts[header]=(counts[header]||0)+1; });
    expected.forEach(function (header) { if (headers.indexOf(header)===-1) addIssue('error',sheetName,1,header,'','Required column is missing.'); });
    Object.keys(counts).forEach(function (header) { if (counts[header]>1) addIssue('error',sheetName,1,header,'','Column name is duplicated.'); });
  }

  function rowsFor(workbook,sheetName,expected) {
    if (!workbook.Sheets[sheetName]) return [];
    var matrix=window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:true,defval:''});
    var headers=(matrix.shift()||[]).map(text);
    return matrix.map(function (cells,index) { var values={}; expected.forEach(function (key) { var position=headers.indexOf(key); values[key]=position<0?'':cells[position]; }); return {sheet:sheetName,number:index+2,values:values}; });
  }

  function parseSettings(workbook) {
    var result={}, required=['schema_version','site_name','output_filename','multi_value_separator','default_timezone'];
    rowsFor(workbook,'Settings',SETTINGS_HEADERS).forEach(function (row) { var key=text(row.values.key); if (!key) return; if (Object.prototype.hasOwnProperty.call(result,key)) addIssue('error','Settings',row.number,'key',key,'Setting key is duplicated.'); result[key]=text(row.values.value); });
    required.forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(result,key)) addIssue('error','Settings',1,'key',key,'Required setting is missing: ' + key + '.'); });
    return result;
  }

  function validateRow(row,definition,separator,id) {
    var v=row.values;
    if (!text(v.summary)) addIssue('warning',row.sheet,row.number,'summary',id,'Summary is missing.');
    if (!text(v.date_updated)) addIssue('warning',row.sheet,row.number,'date_updated',id,'Updated date is missing.');
    if (text(v.thumbnail_src) && !text(v.thumbnail_alt)) addIssue('warning',row.sheet,row.number,'thumbnail_alt',id,'Thumbnail alternative text is missing.');
    ['featured','published'].forEach(function (field) { if (parseBoolean(v[field])===null) addIssue('error',row.sheet,row.number,field,id,'Enter TRUE or FALSE.'); });
    ['date_published','date_updated'].forEach(function (field) { if (text(v[field]) && !parseDate(v[field],false)) addIssue('error',row.sheet,row.number,field,id,'Enter a valid date.'); });
    NON_NEGATIVE.forEach(function (field) { if (!Object.prototype.hasOwnProperty.call(v,field) || text(v[field])==='') return; var number=parseNumber(v[field]); if (number===null || number<0) addIssue('error',row.sheet,row.number,field,id,'Enter a non-negative number.'); else if (INTEGER_FIELDS.indexOf(field)!==-1 && !Number.isInteger(number)) addIssue('error',row.sheet,row.number,field,id,'Enter a whole number.'); });
    if (text(v.estimated_minutes)!=='') { var estimated=parseNumber(v.estimated_minutes); if (estimated===null || !Number.isInteger(estimated) || estimated<=0) addIssue('error',row.sheet,row.number,'estimated_minutes',id,'Enter a positive whole number or leave the cell blank.'); }
    URL_FIELDS.forEach(function (field) { if (Object.prototype.hasOwnProperty.call(v,field) && text(v[field]) && !parseUrl(v[field])) addIssue('error',row.sheet,row.number,field,id,'Enter a valid http or https URL.'); });
    if (definition.type==='tool' && !text(v.privacy_notes)) addIssue('warning',row.sheet,row.number,'privacy_notes',id,'Privacy notes are missing.');
    if (definition.type==='event') { if (text(v.booking_required) && parseBoolean(v.booking_required)===null) addIssue('error',row.sheet,row.number,'booking_required',id,'Enter TRUE or FALSE.'); if (!text(v.capacity)) addIssue('warning',row.sheet,row.number,'capacity',id,'Event capacity is blank.'); if (text(v.start_date_time)&&!parseDate(v.start_date_time,true)) addIssue('error',row.sheet,row.number,'start_date_time',id,'Enter a valid date and time.'); if (text(v.end_date_time)&&!parseDate(v.end_date_time,true)) addIssue('error',row.sheet,row.number,'end_date_time',id,'Enter a valid date and time.'); }
  }

  // Phase 2: normalise workbook rows into the published JSON shape.
  function normaliseSharedFields(row,definition,separator) {
    var v=row.values;
    return {id:text(v.id),type:definition.type,title:text(v.title),summary:text(v.summary),author:{name:text(v.author_name),organisation:text(v.author_organisation),course:text(v.author_course),yearOfStudy:text(v.author_year_of_study)},datePublished:parseDate(v.date_published,false)||'',dateUpdated:parseDate(v.date_updated,false)||'',librarySection:text(v.library_section),skillAreas:parseMultiValue(v.skill_areas,separator),tags:parseMultiValue(v.tags,separator),featured:parseBoolean(v.featured)===true,published:parseBoolean(v.published)!==false,estimatedMinutes:parseNumber(v.estimated_minutes),thumbnail:{src:text(v.thumbnail_src),alt:text(v.thumbnail_alt)},content:{},_source:{sheet:row.sheet,row:row.number}};
  }

  function buildResource(row,d,s) { var r=normaliseSharedFields(row,d,s),v=row.values; if(d.type==='prompt')r.content=buildPrompt(v,s); if(d.type==='workflow')r.content=buildWorkflow(v); if(d.type==='tool')r.content=buildTool(v,s); if(d.type==='article')r.content=buildArticle(v); if(d.type==='video')r.content=buildVideo(v); if(d.type==='link')r.content=buildLink(v); if(d.type==='download')r.content=buildDownload(v); if(d.type==='event')r.content=buildEvent(v); if(d.type==='showcase')r.content=buildShowcase(v,s); return r; }
  function buildPrompt(v,s){return{purpose:text(v.purpose),promptText:text(v.prompt_text),platforms:parseMultiValue(v.platforms,s),modelsTested:parseMultiValue(v.models_tested,s),reasoningMode:text(v.reasoning_mode),usageNotes:text(v.usage_notes)}}
  function buildWorkflow(v){return{goal:text(v.goal),steps:[],reflection:text(v.reflection),estimatedTotalMinutes:parseNumber(v.estimated_total_minutes),complexityScore:parseNumber(v.complexity_score)}}
  function buildTool(v,s){return{company:text(v.company),toolUrl:text(v.tool_url),rating:parseNumber(v.rating),overview:text(v.overview),strengths:parseMultiValue(v.strengths,s),weaknesses:parseMultiValue(v.weaknesses,s),pricing:{model:text(v.pricing_model),cost:parseNumber(v.cost)},platformTypes:parseMultiValue(v.platform_types,s),accessibilityNotes:text(v.accessibility_notes),privacyNotes:text(v.privacy_notes),reviewVerdict:text(v.review_verdict)}}
  function buildArticle(v){return{body:text(v.body),readingTimeMinutes:parseNumber(v.reading_time_minutes),sourceUrl:text(v.source_url)}}
  function buildVideo(v){return{provider:text(v.provider),videoUrl:text(v.video_url),embedUrl:text(v.embed_url),durationSeconds:parseNumber(v.duration_seconds)}}
  function buildLink(v){return{url:text(v.url),siteName:text(v.site_name),description:text(v.description)}}
  function buildDownload(v){return{fileUrl:text(v.file_url),fileName:text(v.file_name),fileFormat:text(v.file_format),fileSizeBytes:parseNumber(v.file_size_bytes),version:text(v.version),description:text(v.description)}}
  function buildEvent(v){return{host:text(v.host),startDateTime:parseDate(v.start_date_time,true)||'',endDateTime:parseDate(v.end_date_time,true)||'',timezone:text(v.timezone),locationType:text(v.location_type),location:text(v.location),onlineUrl:text(v.online_url),description:text(v.description),capacity:parseNumber(v.capacity),bookingUrl:text(v.booking_url),bookingRequired:parseBoolean(v.booking_required)===true}}
  function buildShowcase(v,s){return{problem:text(v.problem),approach:text(v.approach),outcome:text(v.outcome),reflection:text(v.reflection),toolsUsed:parseMultiValue(v.tools_used,s),projectUrl:text(v.project_url)}}

  function attachWorkflowSteps(workbook) {
    var workflows=Object.create(null),numbers=Object.create(null);
    state.resources.filter(function(r){return r.type==='workflow';}).forEach(function(r){workflows[r.id]=r;numbers[r.id]=Object.create(null);});
    rowsFor(workbook,'Workflow Steps',STEP_HEADERS).forEach(function(row){var v=row.values,id=text(v.workflow_id),has=id||text(v.step_number)||text(v.title)||text(v.description);if(!has)return;if(!id){addIssue('error','Workflow Steps',row.number,'workflow_id','','Workflow ID is required for every step.');return;}if(!workflows[id]){addIssue('error','Workflow Steps',row.number,'workflow_id',id,'Step refers to a workflow that does not exist.');return;}var n=parseNumber(v.step_number);if(n===null||!Number.isInteger(n)||n<=0){addIssue('error','Workflow Steps',row.number,'step_number',id,'Step number must be a positive whole number.');return;}if(numbers[id][n]){addIssue('error','Workflow Steps',row.number,'step_number',id,'Step number is duplicated for this workflow.');return;}numbers[id][n]=true;workflows[id].content.steps.push({stepNumber:n,title:text(v.title),description:text(v.description)});});
    Object.keys(workflows).forEach(function(id){workflows[id].content.steps.sort(function(a,b){return a.stepNumber-b.stepNumber;});});
  }

  function parseBoolean(value){if(value===true||value===1)return true;if(value===false||value===0)return false;var v=text(value).toLowerCase();if(v==='true')return true;if(v==='false')return false;return null;}
  function parseNumber(value){if(value===null||value===undefined||text(value)==='')return null;var n=typeof value==='number'?value:Number(text(value));return Number.isFinite(n)?n:null;}
  function parseDate(value,withTime){if(value instanceof Date&&!isNaN(value.getTime()))return withTime?value.toISOString():value.toISOString().slice(0,10);if(typeof value==='number'){var parts=window.XLSX.SSF.parse_date_code(value);if(!parts)return null;var d=new Date(Date.UTC(parts.y,parts.m-1,parts.d,parts.H||0,parts.M||0,Math.floor(parts.S||0)));return withTime?d.toISOString():d.toISOString().slice(0,10);}var raw=text(value);if(!raw)return null;if(!withTime){var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);if(!match)return null;var date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));if(date.getUTCFullYear()!==Number(match[1])||date.getUTCMonth()!==Number(match[2])-1||date.getUTCDate()!==Number(match[3]))return null;return raw;}if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw))return null;var parsed=new Date(raw);if(isNaN(parsed.getTime()))return null;return raw;}
  function parseMultiValue(value,separator){var seen=Object.create(null);return text(value).split(separator||'|').map(function(v){return v.trim();}).filter(function(v){if(!v||seen[v])return false;seen[v]=true;return true;});}
  function parseUrl(value){try{var u=new URL(text(value));return u.protocol==='http:'||u.protocol==='https:';}catch(e){return false;}}

  // Phase 3: authoritatively validate the complete schema 1.1 payload.
  var COLUMN_BY_PATH = {
    id:'id',title:'title',summary:'summary','author.name':'author_name','author.organisation':'author_organisation',
    'author.course':'author_course','author.yearOfStudy':'author_year_of_study',datePublished:'date_published',dateUpdated:'date_updated',
    librarySection:'library_section',skillAreas:'skill_areas',tags:'tags',featured:'featured',published:'published',
    estimatedMinutes:'estimated_minutes','thumbnail.src':'thumbnail_src','thumbnail.alt':'thumbnail_alt',
    'content.purpose':'purpose','content.promptText':'prompt_text','content.platforms':'platforms','content.modelsTested':'models_tested',
    'content.reasoningMode':'reasoning_mode','content.usageNotes':'usage_notes','content.goal':'goal','content.reflection':'reflection',
    'content.estimatedTotalMinutes':'estimated_total_minutes','content.complexityScore':'complexity_score','content.company':'company',
    'content.toolUrl':'tool_url','content.rating':'rating','content.overview':'overview','content.strengths':'strengths',
    'content.weaknesses':'weaknesses','content.pricing.model':'pricing_model','content.pricing.cost':'cost',
    'content.platformTypes':'platform_types','content.accessibilityNotes':'accessibility_notes','content.privacyNotes':'privacy_notes',
    'content.reviewVerdict':'review_verdict','content.body':'body','content.readingTimeMinutes':'reading_time_minutes',
    'content.sourceUrl':'source_url','content.provider':'provider','content.videoUrl':'video_url','content.embedUrl':'embed_url',
    'content.durationSeconds':'duration_seconds','content.url':'url','content.siteName':'site_name','content.description':'description',
    'content.fileUrl':'file_url','content.fileName':'file_name','content.fileFormat':'file_format','content.fileSizeBytes':'file_size_bytes',
    'content.version':'version','content.host':'host','content.startDateTime':'start_date_time','content.endDateTime':'end_date_time',
    'content.timezone':'timezone','content.locationType':'location_type','content.location':'location','content.onlineUrl':'online_url',
    'content.capacity':'capacity','content.bookingUrl':'booking_url','content.bookingRequired':'booking_required',
    'content.problem':'problem','content.approach':'approach','content.outcome':'outcome','content.toolsUsed':'tools_used','content.projectUrl':'project_url'
  };

  function publicResource(resource){var copy={};Object.keys(resource).forEach(function(key){if(key!=='_source')copy[key]=resource[key];});return copy;}
  function createPayload(resources,timestamp,includeUnpublished){var selected=includeUnpublished?resources:resources.filter(function(resource){return resource.published===true;});return{schemaVersion:SCHEMA_VERSION,lastUpdated:timestamp,resources:selected.map(publicResource)};}
  function schemaColumn(path){var relative=path.replace(/^resources\[\d+\]\.?/,'').replace(/\[\d+\].*$/,'');return COLUMN_BY_PATH[relative]||relative;}
  function schemaIssue(path,message,sources,index){var source=index!==undefined&&sources&&sources[index]&&sources[index]._source?sources[index]._source:null;var id=index!==undefined&&sources&&sources[index]?text(sources[index].id):'';addIssue('error',source?source.sheet:'JSON',source?source.row:1,source?schemaColumn(path):path,id,path + ': ' + message);}
  function schemaObject(value,path,sources,index){if(value===null||typeof value!=='object'||Array.isArray(value)){schemaIssue(path,'expected an object.',sources,index);return false;}return true;}
  function schemaString(value,path,allowEmpty,sources,index){if(typeof value!=='string'){schemaIssue(path,'expected a string.',sources,index);return false;}if(!allowEmpty&&!value.trim()){schemaIssue(path,'must not be empty.',sources,index);return false;}return true;}
  function schemaBoolean(value,path,sources,index){if(typeof value!=='boolean'){schemaIssue(path,'expected TRUE or FALSE.',sources,index);return false;}return true;}
  function schemaNumberOrNull(value,path,integer,positive,sources,index){if(value===null)return true;if(typeof value!=='number'||!Number.isFinite(value)||(positive?value<=0:value<0)){schemaIssue(path,positive?'expected a positive number or null.':'expected a non-negative number or null.',sources,index);return false;}if(integer&&!Number.isInteger(value)){schemaIssue(path,'expected a whole number or null.',sources,index);return false;}return true;}
  function schemaEnum(value,allowed,path,sources,index){if(!schemaString(value,path,false,sources,index))return false;if(allowed.indexOf(value)===-1){schemaIssue(path,'unsupported value "' + value + '".',sources,index);return false;}return true;}
  function schemaStringArray(value,path,allowed,sources,index){if(!Array.isArray(value)){schemaIssue(path,'expected an array.',sources,index);return false;}value.forEach(function(item,itemIndex){var itemPath=path+'['+itemIndex+']';if(schemaString(item,itemPath,false,sources,index)&&allowed&&allowed.indexOf(item)===-1)schemaIssue(itemPath,'unsupported value "'+item+'".',sources,index);});return true;}
  function schemaDate(value,path,sources,index){if(!schemaString(value,path,true,sources,index)||!value)return;var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match){schemaIssue(path,'expected a date in YYYY-MM-DD format.',sources,index);return;}var date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));if(date.getUTCFullYear()!==Number(match[1])||date.getUTCMonth()!==Number(match[2])-1||date.getUTCDate()!==Number(match[3]))schemaIssue(path,'expected a valid calendar date.',sources,index);}
  function schemaDateTime(value,path,allowEmpty,sources,index){if(!schemaString(value,path,allowEmpty,sources,index)||!value)return;if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||isNaN(new Date(value).getTime()))schemaIssue(path,'expected a valid ISO 8601 date and time with a timezone.',sources,index);}
  function schemaUrl(value,path,sources,index){if(!schemaString(value,path,true,sources,index)||!value)return;if(!parseUrl(value))schemaIssue(path,'expected a valid http or https URL.',sources,index);}

  function validateAuthorSchema(author,path,sources,index){if(!schemaObject(author,path,sources,index))return;schemaString(author.name,path+'.name',true,sources,index);schemaString(author.organisation,path+'.organisation',true,sources,index);schemaString(author.course,path+'.course',true,sources,index);schemaString(author.yearOfStudy,path+'.yearOfStudy',true,sources,index);}
  function validateThumbnailSchema(thumbnail,path,sources,index){if(!schemaObject(thumbnail,path,sources,index))return;schemaUrl(thumbnail.src,path+'.src',sources,index);schemaString(thumbnail.alt,path+'.alt',true,sources,index);}
  function validatePromptSchema(content,path,sources,index){schemaString(content.purpose,path+'.purpose',true,sources,index);schemaString(content.promptText,path+'.promptText',true,sources,index);schemaStringArray(content.platforms,path+'.platforms',null,sources,index);schemaStringArray(content.modelsTested,path+'.modelsTested',null,sources,index);schemaEnum(content.reasoningMode,ALLOWED.reasoning_mode,path+'.reasoningMode',sources,index);schemaString(content.usageNotes,path+'.usageNotes',true,sources,index);}
  function validateWorkflowSchema(content,path,sources,index){schemaString(content.goal,path+'.goal',true,sources,index);if(Array.isArray(content.steps)){var numbers=Object.create(null);content.steps.forEach(function(step,stepIndex){var stepPath=path+'.steps['+stepIndex+']';if(!schemaObject(step,stepPath,sources,index))return;if(typeof step.stepNumber!=='number'||!Number.isInteger(step.stepNumber)||step.stepNumber<=0)schemaIssue(stepPath+'.stepNumber','expected a positive whole number.',sources,index);else if(numbers[step.stepNumber])schemaIssue(stepPath+'.stepNumber','must be unique within the workflow.',sources,index);else numbers[step.stepNumber]=true;schemaString(step.title,stepPath+'.title',true,sources,index);schemaString(step.description,stepPath+'.description',true,sources,index);});}else schemaIssue(path+'.steps','expected an array.',sources,index);schemaString(content.reflection,path+'.reflection',true,sources,index);schemaNumberOrNull(content.estimatedTotalMinutes,path+'.estimatedTotalMinutes',false,false,sources,index);schemaNumberOrNull(content.complexityScore,path+'.complexityScore',false,false,sources,index);}
  function validateToolSchema(content,path,sources,index){schemaString(content.company,path+'.company',true,sources,index);schemaUrl(content.toolUrl,path+'.toolUrl',sources,index);if(typeof content.rating!=='number'||!Number.isFinite(content.rating)||Math.round(content.rating*10)!==content.rating*10||content.rating<1||content.rating>5)schemaIssue(path+'.rating','expected a number from 1 to 5 with no more than one decimal place.',sources,index);schemaString(content.overview,path+'.overview',true,sources,index);schemaStringArray(content.strengths,path+'.strengths',null,sources,index);schemaStringArray(content.weaknesses,path+'.weaknesses',null,sources,index);if(schemaObject(content.pricing,path+'.pricing',sources,index)){schemaEnum(content.pricing.model,ALLOWED.pricing_model,path+'.pricing.model',sources,index);schemaNumberOrNull(content.pricing.cost,path+'.pricing.cost',false,false,sources,index);}schemaStringArray(content.platformTypes,path+'.platformTypes',ALLOWED.platform_types,sources,index);schemaString(content.accessibilityNotes,path+'.accessibilityNotes',true,sources,index);schemaString(content.privacyNotes,path+'.privacyNotes',true,sources,index);schemaString(content.reviewVerdict,path+'.reviewVerdict',true,sources,index);}
  function validateEventSchema(content,path,sources,index){schemaString(content.host,path+'.host',true,sources,index);schemaDateTime(content.startDateTime,path+'.startDateTime',true,sources,index);schemaDateTime(content.endDateTime,path+'.endDateTime',true,sources,index);if(content.startDateTime&&content.endDateTime&&!isNaN(new Date(content.startDateTime).getTime())&&!isNaN(new Date(content.endDateTime).getTime())&&new Date(content.endDateTime).getTime()<=new Date(content.startDateTime).getTime())schemaIssue(path+'.endDateTime','must be later than startDateTime.',sources,index);schemaString(content.timezone,path+'.timezone',true,sources,index);schemaEnum(content.locationType,ALLOWED.location_type,path+'.locationType',sources,index);schemaString(content.location,path+'.location',true,sources,index);schemaUrl(content.onlineUrl,path+'.onlineUrl',sources,index);schemaString(content.description,path+'.description',true,sources,index);schemaNumberOrNull(content.capacity,path+'.capacity',true,false,sources,index);schemaUrl(content.bookingUrl,path+'.bookingUrl',sources,index);schemaBoolean(content.bookingRequired,path+'.bookingRequired',sources,index);}
  function validateContentSchema(type,content,path,sources,index){if(!schemaObject(content,path,sources,index))return;if(type==='prompt')validatePromptSchema(content,path,sources,index);else if(type==='workflow')validateWorkflowSchema(content,path,sources,index);else if(type==='tool')validateToolSchema(content,path,sources,index);else if(type==='article'){schemaString(content.body,path+'.body',true,sources,index);schemaNumberOrNull(content.readingTimeMinutes,path+'.readingTimeMinutes',true,false,sources,index);schemaUrl(content.sourceUrl,path+'.sourceUrl',sources,index);}else if(type==='video'){schemaString(content.provider,path+'.provider',true,sources,index);schemaUrl(content.videoUrl,path+'.videoUrl',sources,index);schemaUrl(content.embedUrl,path+'.embedUrl',sources,index);schemaNumberOrNull(content.durationSeconds,path+'.durationSeconds',true,false,sources,index);}else if(type==='link'){schemaUrl(content.url,path+'.url',sources,index);schemaString(content.siteName,path+'.siteName',true,sources,index);schemaString(content.description,path+'.description',true,sources,index);}else if(type==='download'){schemaUrl(content.fileUrl,path+'.fileUrl',sources,index);schemaString(content.fileName,path+'.fileName',true,sources,index);schemaString(content.fileFormat,path+'.fileFormat',true,sources,index);schemaNumberOrNull(content.fileSizeBytes,path+'.fileSizeBytes',true,false,sources,index);schemaString(content.version,path+'.version',true,sources,index);schemaString(content.description,path+'.description',true,sources,index);}else if(type==='event')validateEventSchema(content,path,sources,index);else if(type==='showcase'){schemaString(content.problem,path+'.problem',true,sources,index);schemaString(content.approach,path+'.approach',true,sources,index);schemaString(content.outcome,path+'.outcome',true,sources,index);schemaString(content.reflection,path+'.reflection',true,sources,index);schemaStringArray(content.toolsUsed,path+'.toolsUsed',null,sources,index);schemaUrl(content.projectUrl,path+'.projectUrl',sources,index);}}
  function validateResourceSchema(resource,index,sources,seen){var path='resources['+index+']';if(!schemaObject(resource,path,sources,index))return;var idValid=schemaString(resource.id,path+'.id',false,sources,index);if(idValid&&!ID_RE.test(resource.id))schemaIssue(path+'.id','expected lowercase letters, numbers and single hyphens.',sources,index);if(idValid){if(seen[resource.id])schemaIssue(path+'.id','duplicate resource id "'+resource.id+'".',sources,index);else seen[resource.id]=true;}var typeValid=schemaEnum(resource.type,DEFINITIONS.map(function(definition){return definition.type;}),path+'.type',sources,index);schemaString(resource.title,path+'.title',false,sources,index);schemaString(resource.summary,path+'.summary',true,sources,index);validateAuthorSchema(resource.author,path+'.author',sources,index);schemaDate(resource.datePublished,path+'.datePublished',sources,index);schemaDate(resource.dateUpdated,path+'.dateUpdated',sources,index);var sectionValid=schemaEnum(resource.librarySection,ALLOWED.library_section,path+'.librarySection',sources,index);var skillsValid=schemaStringArray(resource.skillAreas,path+'.skillAreas',ALLOWED.skill_areas,sources,index);if(skillsValid&&typeValid&&resource.type==='tool'&&resource.skillAreas.length!==0)schemaIssue(path+'.skillAreas','Tool reviews must leave skill_areas blank.',sources,index);if(skillsValid&&typeValid&&resource.type!=='tool'&&resource.skillAreas.length!==1)schemaIssue(path+'.skillAreas','Enter exactly one skill area.',sources,index);schemaStringArray(resource.tags,path+'.tags',null,sources,index);schemaBoolean(resource.featured,path+'.featured',sources,index);schemaBoolean(resource.published,path+'.published',sources,index);schemaNumberOrNull(resource.estimatedMinutes,path+'.estimatedMinutes',true,true,sources,index);if(typeValid&&sectionValid&&TYPE_SECTIONS[resource.type].indexOf(resource.librarySection)===-1)schemaIssue(path+'.librarySection',resource.type+' resources are not allowed in '+resource.librarySection+'.',sources,index);validateThumbnailSchema(resource.thumbnail,path+'.thumbnail',sources,index);if(typeValid)validateContentSchema(resource.type,resource.content,path+'.content',sources,index);}
  function validatePayloadSchema(payload,sources){if(!schemaObject(payload,'payload',sources))return;if(payload.schemaVersion!==SCHEMA_VERSION)schemaIssue('schemaVersion','expected "'+SCHEMA_VERSION+'".',sources);schemaDateTime(payload.lastUpdated,'lastUpdated',false,sources);if(!Array.isArray(payload.resources)){schemaIssue('resources','expected an array.',sources);return;}var seen=Object.create(null);payload.resources.forEach(function(resource,index){validateResourceSchema(resource,index,sources,seen);});}

  function text(value){if(value===null||value===undefined)return'';return String(value).trim();}
  function addIssue(severity,sheet,row,column,id,message){var duplicate=state.issues.some(function(issue){return issue.severity===severity&&issue.sheet===sheet&&issue.row===row&&issue.column===column&&issue.resourceId===id&&issue.message===message;});if(!duplicate)state.issues.push({severity:severity,sheet:sheet,row:row,column:column,resourceId:id,message:message});}

  function renderAll(){ui.empty.hidden=true;ui.results.hidden=false;renderCounts();renderIssues('error',ui.errors);renderIssues('warning',ui.warnings);populateFilter();renderPreview();var errors=state.issues.some(function(i){return i.severity==='error';}),published=state.resources.filter(function(r){return r.published;}),excluded=state.resources.length-published.length;ui.preview.hidden=!state.resources.length;ui.export.hidden=!state.resources.length;ui.download.disabled=errors||!state.resources.length;ui['export-summary'].textContent=errors?'Resolve every error before downloading.':published.length+' published resource'+(published.length===1?'':'s')+' will be included; '+excluded+' unpublished resource'+(excluded===1?' is':'s are')+' excluded.';}
  function renderCounts(){clear(ui.counts);DEFINITIONS.forEach(function(d){var count=state.resources.filter(function(r){return r.type===d.type;}).length;var col=element('div','col-6 col-md-4 col-lg-3 mb-2');var box=element('div','border rounded p-2 h-100');box.appendChild(element('strong','d-block',String(count)));box.appendChild(document.createTextNode(d.sheet));col.appendChild(box);ui.counts.appendChild(col);});}
  function renderIssues(severity,container){var issues=state.issues.filter(function(i){return i.severity===severity;}),summary=container.querySelector('summary'),body=container.querySelector('div');summary.textContent=(severity==='error'?'Errors':'Warnings')+' ('+issues.length+')';clear(body);if(!issues.length){body.appendChild(element('p','text-muted','None.'));return;}var list=element('ul','list-group');issues.forEach(function(i){var item=element('li','list-group-item');item.appendChild(element('strong','d-block',i.sheet+' — row '+i.row+(i.column?' — '+i.column:'')));item.appendChild(document.createTextNode((i.resourceId?'['+i.resourceId+'] ':'')+i.message));list.appendChild(item);});body.appendChild(list);}
  function populateFilter(){var current=ui['type-filter'].value;while(ui['type-filter'].options.length>1)ui['type-filter'].remove(1);DEFINITIONS.forEach(function(d){if(state.resources.some(function(r){return r.type===d.type;})){var option=document.createElement('option');option.value=d.type;option.textContent=d.sheet;ui['type-filter'].appendChild(option);}});ui['type-filter'].value=current;}
  function renderPreview(){clear(ui.cards);var type=ui['type-filter'].value,resources=state.resources.filter(function(r){return !type||r.type===type;});ui['preview-summary'].textContent=resources.length+' of '+state.resources.length+' resources shown.';resources.forEach(function(r){var col=element('div','col-12 col-md-6 col-lg-4 mb-3'),card=element('article','card h-100 shadow-sm'),body=element('div','card-body');body.appendChild(element('p','text-uppercase font-weight-bold small mb-1',r.type));body.appendChild(element('h3','h5',r.title||'(Untitled resource)'));body.appendChild(element('p','text-muted',r.summary||'No summary supplied.'));var badge=element('span','badge '+(r.published?'badge-success':'badge-secondary'),r.published?'Published':'Unpublished');body.appendChild(badge);if(r.featured)body.appendChild(element('span','badge badge-warning ml-2','Featured'));card.appendChild(body);col.appendChild(card);ui.cards.appendChild(col);});}
  function downloadJson(){if(ui.download.disabled||!state.payload)return;var sources=state.resources.filter(function(resource){return resource.published===true;}),before=state.issues.length,payload=createPayload(sources,new Date().toISOString(),false);validatePayloadSchema(payload,sources);if(state.issues.length>before){state.payload=null;renderAll();status('The final JSON failed validation and was not downloaded. Resolve the reported errors and try again.','danger');return;}state.payload=payload;var filename=text(state.settings.output_filename)||'resources.json';if(!/\.json$/i.test(filename))filename+='.json';filename=filename.replace(/[\\/:*?"<>|]/g,'-');var blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.setAttribute('h'+'ref',url);link.setAttribute('download',filename);document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);status(filename+' downloaded successfully.','success');}
  function element(tag,className,value){var node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;}
  function clear(node){while(node.firstChild)node.removeChild(node.firstChild);}
  start();
}());
