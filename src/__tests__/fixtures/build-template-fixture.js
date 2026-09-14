// Builds a small, hand-authored .pptx used as a "corporate template" fixture
// in the template-support tests. Written directly against JSZip (rather than
// produced via PptxGenJS) so the test has full control over layout names and
// distinct master/layout backgrounds, independent of whatever PptxGenJS
// happens to generate.
//
// Structure: one slideMaster with two slideLayouts —
//   "Content Light" — white background, light footer bar
//   "Section Dark"   — dark background, accent "logo" block
// plus a theme, notesMaster, and standard presentation-level parts. Slide
// size is 13.333x7.5in (widescreen), deliberately different from
// dom-to-pptx's own 10x5.625in default so tests can assert the template's
// sldSz is adopted automatically.
import JSZip from 'jszip';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CONTENT_TYPES = `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>
<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const CORE_XML = `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Corporate Template Fixture</dc:title>
</cp:coreProperties>`;

const APP_XML = `${XML_DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>dom-to-pptx test fixture</Application>
</Properties>`;

const PRESENTATION_XML = `${XML_DECL}<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst/>
<p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>
<p:sldSz cx="12192000" cy="6858000"/>
<p:notesSz cx="6858000" cy="12192000"/>
</p:presentation>`;

const PRESENTATION_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>
<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>
</Relationships>`;

const PRES_PROPS = `${XML_DECL}<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`;

const VIEW_PROPS = `${XML_DECL}<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`;

const TABLE_STYLES = `${XML_DECL}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;

const THEME_XML = `${XML_DECL}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Corporate Fixture Theme">
<a:themeElements>
<a:clrScheme name="Corporate">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1A1A2E"/></a:dk2>
<a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>
<a:accent1><a:srgbClr val="0F62FE"/></a:accent1>
<a:accent2><a:srgbClr val="FF6F61"/></a:accent2>
<a:accent3><a:srgbClr val="24A148"/></a:accent3>
<a:accent4><a:srgbClr val="8A3FFC"/></a:accent4>
<a:accent5><a:srgbClr val="F1C21B"/></a:accent5>
<a:accent6><a:srgbClr val="D12771"/></a:accent6>
<a:hlink><a:srgbClr val="0F62FE"/></a:hlink>
<a:folHlink><a:srgbClr val="8A3FFC"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Corporate">
<a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Corporate">
<a:fillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:fillStyleLst>
<a:lnStyleLst>
<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
</a:lnStyleLst>
<a:effectStyleLst>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
</a:effectStyleLst>
<a:bgFillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`;

const NOTES_MASTER_XML = `${XML_DECL}<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:notesMaster>`;

const NOTES_MASTER_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const CLR_MAP =
  'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

const SLIDE_MASTER_XML = `${XML_DECL}<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
<p:clrMap ${CLR_MAP}/>
<p:sldLayoutIdLst>
<p:sldLayoutId id="2147483649" r:id="rId1"/>
<p:sldLayoutId id="2147483650" r:id="rId2"/>
</p:sldLayoutIdLst>
</p:sldMaster>`;

const SLIDE_MASTER_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const SLIDE_LAYOUT_RELS = `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

// "Content Light" — white background, thin light-gray footer bar (stands in
// for a corporate footer element that must survive as real master content,
// not a rasterized image).
const SLIDE_LAYOUT_1_XML = `${XML_DECL}<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Content Light">
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr/>
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="Footer Bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>
<a:xfrm><a:off x="0" y="6706177"/><a:ext cx="12192000" cy="76200"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
<a:solidFill><a:srgbClr val="CCCCCC"/></a:solidFill>
</p:spPr>
<p:txBody><a:bodyPr/><a:p/></p:txBody>
</p:sp>
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:overrideClrMapping ${CLR_MAP}/></p:clrMapOvr>
</p:sldLayout>`;

// "Section Dark" — dark background, accent "logo" block top-right, distinct
// enough to be trivially distinguishable from Content Light in tests.
const SLIDE_LAYOUT_2_XML = `${XML_DECL}<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Section Dark">
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="1A1A2E"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr/>
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="Logo Block"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>
<a:xfrm><a:off x="11125200" y="228600"/><a:ext cx="800000" cy="400000"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
<a:solidFill><a:srgbClr val="F1C21B"/></a:solidFill>
</p:spPr>
<p:txBody><a:bodyPr/><a:p/></p:txBody>
</p:sp>
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:overrideClrMapping ${CLR_MAP}/></p:clrMapOvr>
</p:sldLayout>`;

/**
 * Builds the fixture and returns it as a Uint8Array, ready to pass directly
 * as an `exportToPptx` `template` option or into `readTemplate`/`getTemplateLayouts`.
 */
export async function buildTemplateFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('docProps/core.xml', CORE_XML);
  zip.file('docProps/app.xml', APP_XML);
  zip.file('ppt/presentation.xml', PRESENTATION_XML);
  zip.file('ppt/_rels/presentation.xml.rels', PRESENTATION_RELS);
  zip.file('ppt/presProps.xml', PRES_PROPS);
  zip.file('ppt/viewProps.xml', VIEW_PROPS);
  zip.file('ppt/tableStyles.xml', TABLE_STYLES);
  zip.file('ppt/theme/theme1.xml', THEME_XML);
  zip.file('ppt/notesMasters/notesMaster1.xml', NOTES_MASTER_XML);
  zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', NOTES_MASTER_RELS);
  zip.file('ppt/slideMasters/slideMaster1.xml', SLIDE_MASTER_XML);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', SLIDE_MASTER_RELS);
  zip.file('ppt/slideLayouts/slideLayout1.xml', SLIDE_LAYOUT_1_XML);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', SLIDE_LAYOUT_RELS);
  zip.file('ppt/slideLayouts/slideLayout2.xml', SLIDE_LAYOUT_2_XML);
  zip.file('ppt/slideLayouts/_rels/slideLayout2.xml.rels', SLIDE_LAYOUT_RELS);

  return zip.generateAsync({ type: 'uint8array' });
}

export const FIXTURE_LAYOUT_NAMES = ['Content Light', 'Section Dark'];
export const FIXTURE_SLDSZ_IN = { width: 12192000 / 914400, height: 6858000 / 914400 };
