/**
 * Command authoring + builtin catalog barrel (Phase 3).
 */
export { txCommand, serviceCommand } from './factories';
export type { CommandMeta } from './factories';

export { first, sequence, when, tap, byId } from './combinators';
export type { CommandFn } from './combinators';

export { createBuiltinCommands, SPECIAL_DOWNGRADE, resetBuiltinIdCounter } from './builtins';
