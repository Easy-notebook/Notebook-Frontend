/**
 * Stream action catalog. Static category imports register concrete handlers before
 * consumers look them up; both streamed events and CLI commands use the registry.
 * Category namespaces also expose handlers for direct use.
 */

import { getAllStreamActionTypes as _getAllStreamActionTypes } from './base';

export {
  StreamAction,
  type StreamActionConstructor,
  registerStreamAction,
  getStreamActionClass,
  getAllStreamActionTypes,
  clearStreamRegistry,
  getStreamRegistry,
} from './base';

// Import all action category modules to trigger registration
// Each import automatically registers all actions in that category
import * as cell from './cell';
import * as qa from './qa';
import * as generation from './generation';
import * as notebook from './notebook';
import * as view from './view';
import * as phase from './phase';
import * as editor from './editor';
import * as code from './code';
import * as convert from './convert';
import * as error from './error';
import * as agent from './agent';
import * as workflow from './workflow';
import * as link from './link';
import * as misc from './misc';
import * as reflecting from './reflecting';

// Export all action classes for direct access if needed
export {
  cell,
  qa,
  generation,
  notebook,
  view,
  phase,
  editor,
  code,
  convert,
  error,
  agent,
  workflow,
  link,
  misc,
  reflecting,
};

// Log all registered actions
console.log('[StreamActions] All actions registered:', _getAllStreamActionTypes());
