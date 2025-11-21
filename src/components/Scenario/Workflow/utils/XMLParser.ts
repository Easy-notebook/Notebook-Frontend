/**
 * XML Parser for Planning/Reflecting API Responses
 * =================================================
 *
 * Complete port from: ref/Notebook-BCC/utils/xml_parser.py
 *
 * Parses XML responses from VDSAgents backend into structured data.
 *
 * Planning API returns XML in three formats:
 * 1. IDLE state → stages list XML
 * 2. STAGE_RUNNING state → steps list XML
 * 3. STEP_RUNNING state → behavior context XML
 *
 * Features:
 * - Robust error recovery
 * - HTML content handling (CDATA wrapping)
 * - Malformed XML repair (boolean attributes, mismatched tags)
 * - Incomplete XML recovery
 * - Special character escaping
 */

/**
 * Stage data structure
 */
export interface StageData {
  stage_id: string;
  title: string;
  goal: string;
  verified_artifacts: Record<string, any>;
  required_variables?: Record<string, string>;
}

/**
 * Step data structure
 */
export interface StepData {
  step_id: string;
  title: string;
  goal: string;
  verified_artifacts: Record<string, any>;
  required_variables?: Record<string, string>;
}

/**
 * Behavior data structure
 */
export interface BehaviorData {
  behavior_id: string;
  title: string;
  verified_artifacts: Record<string, any>;
}

/**
 * Planning response (from IDLE state)
 */
export interface PlanningResponse {
  stages: StageData[];
  focus?: string;
  title?: string;
  description?: string;
  _warning?: string;
}

/**
 * Steps response (from STAGE_RUNNING state)
 */
export interface StepsResponse {
  steps: StepData[];
  focus?: string;
  _warning?: string;
}

/**
 * Behavior response (from STEP_RUNNING state planning)
 */
export interface BehaviorResponse {
  behavior_id: string;
  step_id?: string;
  agent?: string;
  task?: string;
  title: string;
  focus?: string;
  verified_artifacts?: Record<string, any>;
  _warning?: string;
}

/**
 * Sanitize XML to fix common backend issues
 *
 * Fixes:
 * 1. Boolean attributes without values
 * 2. HTML content wrapping in CDATA
 * 3. Mismatched closing tags
 * 4. Special character escaping
 */
function sanitizeXML(xmlString: string): string {
  console.log('[XMLParser] Starting XML sanitization...');

  // Step 1: Fix boolean attributes
  xmlString = fixBooleanAttributes(xmlString);

  // Step 2: Wrap HTML content in CDATA
  xmlString = wrapHTMLInCDATA(xmlString);

  // Step 3: Fix mismatched tags
  xmlString = fixMismatchedTags(xmlString);

  // Step 4: Escape special characters in text content
  xmlString = escapeSpecialCharacters(xmlString);

  console.log('[XMLParser] Sanitization complete');
  return xmlString;
}

/**
 * Fix boolean attributes without values
 * Examples:
 * - <stage optional> → <stage optional="true">
 * - <step required> → <step required="true">
 */
function fixBooleanAttributes(xmlString: string): string {
  // Pattern: attribute name followed by whitespace and then > or another attribute
  const pattern = /\b(optional|required|disabled|enabled|hidden)\s*([>\s])/g;

  return xmlString.replace(pattern, (match, attrName, following) => {
    return `${attrName}="true"${following}`;
  });
}

/**
 * Wrap HTML content in CDATA sections
 *
 * Detects HTML tags within XML variable elements and wraps them in CDATA
 */
function wrapHTMLInCDATA(xmlString: string): string {
  // HTML tags that indicate HTML content
  const htmlIndicators =
    /<(?:div|table|style|script|html|body|head|span|p|h[1-6]|ul|ol|li|tr|td|th|thead|tbody)\b/i;

  // Find all <variable> tags with their content
  const variablePattern = /(<variable[^>]*>)([\s\S]*?)(<\/variable>)/g;

  return xmlString.replace(variablePattern, (match, openTag, content, closeTag) => {
    // Check if content contains HTML
    if (htmlIndicators.test(content)) {
      // Already has CDATA?
      if (content.includes('<![CDATA[')) {
        return match;
      }

      // Wrap in CDATA
      console.log('[XMLParser] Wrapping HTML content in CDATA');
      return `${openTag}<![CDATA[${content}]]>${closeTag}`;
    }

    return match;
  });
}

/**
 * Fix mismatched closing tags
 *
 * Repairs cases where closing tag doesn't match opening tag
 */
function fixMismatchedTags(xmlString: string): string {
  const tagPattern = /<\/?[\w:]+[^>]*>/g;
  const stack: string[] = [];
  const result: string[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(xmlString)) !== null) {
    const token = match[0];
    const start = match.index;

    // Add text before this tag
    result.push(xmlString.substring(lastIndex, start));

    // Parse tag
    const isClosing = token.startsWith('</');
    const isSelfClosing = token.endsWith('/>');
    const tagNameMatch = token.match(/<\/?(\w+)/);
    const tagName = tagNameMatch ? tagNameMatch[1] : '';

    if (isClosing) {
      // Closing tag
      if (stack.length > 0) {
        const expected = stack[stack.length - 1];
        if (tagName !== expected) {
          console.warn(
            `[XMLParser] Fixing mismatched closing tag </${tagName}>, expected </${expected}>`
          );
          result.push(`</${expected}>`);
        } else {
          result.push(token);
        }
        stack.pop();
      } else {
        result.push(token);
      }
    } else {
      // Opening tag
      if (!isSelfClosing) {
        stack.push(tagName);
      }
      result.push(token);
    }

    lastIndex = start + token.length;
  }

  // Add remaining text
  result.push(xmlString.substring(lastIndex));

  return result.join('');
}

/**
 * Escape special characters in text content
 *
 * Handles <, >, & but preserves them in tags and CDATA
 */
function escapeSpecialCharacters(xmlString: string): string {
  const result: string[] = [];
  let i = 0;
  let inTag = false;
  let inCDATA = false;

  while (i < xmlString.length) {
    // Check if entering CDATA
    if (xmlString.substring(i, i + 9) === '<![CDATA[') {
      inCDATA = true;
      result.push(xmlString.substring(i, i + 9));
      i += 9;
      continue;
    }

    // Check if exiting CDATA
    if (inCDATA && xmlString.substring(i, i + 3) === ']]>') {
      inCDATA = false;
      result.push(']]>');
      i += 3;
      continue;
    }

    // Inside CDATA, don't escape anything
    if (inCDATA) {
      result.push(xmlString[i]);
      i++;
      continue;
    }

    const char = xmlString[i];

    if (!inTag && char === '<') {
      // Check if this is a real tag start
      if (i + 1 < xmlString.length && /[a-zA-Z/?!]/.test(xmlString[i + 1])) {
        inTag = true;
        result.push(char);
      } else {
        // Not a real tag, escape it
        result.push('&lt;');
      }
    } else if (inTag && char === '>') {
      // Exiting a tag
      inTag = false;
      result.push(char);
    } else if (!inTag) {
      // We're in text content, escape special chars
      if (char === '&') {
        // Check if already escaped
        const next4 = xmlString.substring(i, i + 4);
        const next5 = xmlString.substring(i, i + 5);
        if (next4 === '&lt;' || next4 === '&gt;' || next5 === '&amp;') {
          result.push(char);
        } else {
          result.push('&amp;');
        }
      } else if (char === '>') {
        result.push('&gt;');
      } else {
        result.push(char);
      }
    } else {
      // In tag, keep as is
      result.push(char);
    }

    i++;
  }

  return result.join('');
}

/**
 * Try to recover from incomplete XML by closing unclosed tags
 */
function tryRecoverIncompleteXML(xmlString: string): string | null {
  console.log('[XMLParser] Attempting to recover incomplete XML...');

  const lines = xmlString.trim().split('\n');
  const tagStack: string[] = [];

  // Track open tags
  for (const line of lines) {
    // Find opening tags
    const openMatches = line.matchAll(/<(\w+)[\s>]/g);
    for (const match of openMatches) {
      const tag = match[1];
      // Skip self-closing tags
      if (!line.includes(`<${tag}`) || !line.includes('/>')) {
        tagStack.push(tag);
      }
    }

    // Find closing tags
    const closeMatches = line.matchAll(/<\/(\w+)>/g);
    for (const match of closeMatches) {
      const tag = match[1];
      if (tagStack.length > 0 && tagStack[tagStack.length - 1] === tag) {
        tagStack.pop();
      }
    }
  }

  // If there are unclosed tags, add closing tags
  if (tagStack.length > 0) {
    console.warn(`[XMLParser] Unclosed tags detected: ${tagStack.join(', ')}`);

    const closingTags = tagStack
      .reverse()
      .map((tag) => `</${tag}>`)
      .join('\n');
    const completedXML = xmlString.trim() + '\n' + closingTags;

    console.log('[XMLParser] ✅ Recovered XML by closing tags');
    return completedXML;
  }

  return null;
}

/**
 * Parse XML string into DOM
 */
function parseXML(xmlString: string): Document {
  // Sanitize XML before parsing
  const sanitizedXML = sanitizeXML(xmlString);

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizedXML, 'text/xml');

  // Check for parse errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    console.error('[XMLParser] Parse error detected');
    console.error('[XMLParser] Original XML:', xmlString.substring(0, 1000));
    console.error('[XMLParser] Sanitized XML:', sanitizedXML.substring(0, 1000));

    // Try to recover from incomplete XML
    const recovered = tryRecoverIncompleteXML(xmlString);
    if (recovered) {
      const recoveredDoc = parser.parseFromString(sanitizeXML(recovered), 'text/xml');
      const recoveredError = recoveredDoc.querySelector('parsererror');
      if (!recoveredError) {
        console.log('[XMLParser] ✅ Successfully recovered from incomplete XML');
        return recoveredDoc;
      }
    }

    throw new Error(`XML Parse Error: ${parserError.textContent}`);
  }

  return doc;
}

/**
 * Get text content of first matching element
 */
function getTextContent(parent: Element | Document, selector: string): string {
  const element = parent.querySelector(selector);
  return element?.textContent?.trim() || '';
}

/**
 * Parse verified_artifacts element
 * Variables are stored as: <variable name="key">description</variable>
 */
function parseVerifiedArtifacts(element: Element | null): Record<string, any> {
  if (!element) return {};

  const artifacts: Record<string, any> = {};
  const varElements = element.querySelectorAll('variable');

  varElements.forEach((varEl) => {
    // Key is in 'name' attribute
    const key = varEl.getAttribute('name');
    const value = varEl.textContent?.trim() || '';

    if (key) {
      // Try to parse as JSON if it looks like JSON
      if (value.startsWith('{') || value.startsWith('[')) {
        try {
          artifacts[key] = JSON.parse(value);
        } catch {
          artifacts[key] = value;
        }
      } else {
        artifacts[key] = value;
      }
    }
  });

  return artifacts;
}

/**
 * Parse required_variables element
 * Returns a dictionary: { variable_name: description }
 */
function parseRequiredVariables(element: Element | null): Record<string, string> {
  if (!element) return {};

  const variables: Record<string, string> = {};
  const varElements = element.querySelectorAll('variable');

  varElements.forEach((varEl) => {
    // Key is in 'name' attribute, value is text content
    const name = varEl.getAttribute('name');
    const description = varEl.textContent?.trim() || '';

    if (name) {
      variables[name] = description;
    }
  });

  return variables;
}

/**
 * Parse stages XML (from IDLE state planning)
 */
export function parseStagesXML(xmlString: string): PlanningResponse {
  console.log('[XMLParser] Parsing stages XML');

  const doc = parseXML(xmlString);
  const root = doc.documentElement;

  // Accept multiple possible root elements
  const validRoots = ['planning_response', 'stages', 'workflow'];
  if (!validRoots.includes(root.tagName)) {
    throw new Error(
      `Unexpected root element: ${root.tagName}. Expected one of: ${validRoots.join(', ')}`
    );
  }

  console.log(`[XMLParser] Root element: ${root.tagName}`);

  const stages: StageData[] = [];
  const stageElements = doc.querySelectorAll('stage');

  stageElements.forEach((stageEl) => {
    // Stage attributes are in XML attributes, not child elements
    // Example: <stage id="data_existence" title="Data Existence">
    const stage: StageData = {
      stage_id: stageEl.getAttribute('id') || '',
      title: stageEl.getAttribute('title') || '',
      goal: getTextContent(stageEl, 'goal'),
      verified_artifacts: parseVerifiedArtifacts(stageEl.querySelector('verified_artifacts')),
    };

    const requiredVars = parseRequiredVariables(stageEl.querySelector('required_variables'));
    if (Object.keys(requiredVars).length > 0) {
      stage.required_variables = requiredVars;
    }

    stages.push(stage);
  });

  console.log(`[XMLParser] Parsed ${stages.length} stages`);

  return {
    stages,
    focus: getTextContent(doc, 'focus') || undefined,
    title: getTextContent(doc, 'title') || undefined,
    description: getTextContent(doc, 'description') || undefined,
  };
}

/**
 * Parse steps XML (from STAGE_RUNNING state planning)
 */
export function parseStepsXML(xmlString: string): StepsResponse {
  console.log('[XMLParser] Parsing steps XML');

  const doc = parseXML(xmlString);
  const root = doc.documentElement;

  // Accept multiple possible root elements
  const validRoots = ['planning_response', 'steps', 'workflow'];
  if (!validRoots.includes(root.tagName)) {
    throw new Error(
      `Unexpected root element: ${root.tagName}. Expected one of: ${validRoots.join(', ')}`
    );
  }

  console.log(`[XMLParser] Root element: ${root.tagName}`);

  const steps: StepData[] = [];
  const stepElements = doc.querySelectorAll('step');

  stepElements.forEach((stepEl) => {
    // Step attributes are in XML attributes, not child elements
    // Example: <step id="data_collection_inventory" title="Data Collection">
    const step: StepData = {
      step_id: stepEl.getAttribute('id') || '',
      title: stepEl.getAttribute('title') || '',
      goal: getTextContent(stepEl, 'goal'),
      verified_artifacts: parseVerifiedArtifacts(stepEl.querySelector('verified_artifacts')),
    };

    const requiredVars = parseRequiredVariables(stepEl.querySelector('required_variables'));
    if (Object.keys(requiredVars).length > 0) {
      step.required_variables = requiredVars;
    }

    steps.push(step);
  });

  console.log(`[XMLParser] Parsed ${steps.length} steps`);

  return {
    steps,
    focus: getTextContent(doc, 'focus') || undefined,
  };
}

/**
 * Parse behavior XML (from STEP_RUNNING state planning)
 */
export function parseBehaviorXML(xmlString: string): BehaviorResponse {
  console.log('[XMLParser] Parsing behavior XML');

  const doc = parseXML(xmlString);
  const root = doc.documentElement;

  // Accept multiple possible root elements
  const validRoots = ['planning_response', 'behavior', 'workflow'];
  if (!validRoots.includes(root.tagName)) {
    throw new Error(
      `Unexpected root element: ${root.tagName}. Expected one of: ${validRoots.join(', ')}`
    );
  }

  console.log(`[XMLParser] Root element: ${root.tagName}`);

  const behaviorEl = doc.querySelector('behavior') || root;

  // Behavior attributes are in XML attributes
  // Example: <behavior id="data_collection_inventory_b1" step_id="data_collection_inventory">
  const behavior_id = behaviorEl.getAttribute('id') || '';
  const step_id = behaviorEl.getAttribute('step_id') || '';

  // Get child elements
  const agent = getTextContent(behaviorEl, 'agent');
  const task = getTextContent(behaviorEl, 'task');
  const title = getTextContent(behaviorEl, 'title') || task || agent; // Use task or agent as fallback for title

  return {
    behavior_id,
    step_id,
    agent,
    task,
    title,
    focus: getTextContent(behaviorEl, 'focus') || undefined,
    verified_artifacts: parseVerifiedArtifacts(behaviorEl.querySelector('verified_artifacts')),
  };
}

/**
 * Auto-detect XML type and parse accordingly
 */
export function parseWorkflowXML(
  xmlString: string
): PlanningResponse | StepsResponse | BehaviorResponse {
  const doc = parseXML(xmlString);

  // Check what type of XML this is
  if (doc.querySelector('stage')) {
    return parseStagesXML(xmlString);
  } else if (doc.querySelector('step')) {
    return parseStepsXML(xmlString);
  } else if (doc.querySelector('behavior')) {
    return parseBehaviorXML(xmlString);
  } else {
    throw new Error('Unknown XML format - no stage, step, or behavior elements found');
  }
}
