import replace from '@rollup/plugin-replace';
import pkg from '../package.json' with { type: 'json' };

export const replacePlugin = (): ReturnType<typeof replace.default> =>
  (replace as unknown as typeof replace.default)({
    preventAssignment: true,
    delimiters: ['', ''],
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),

    // global $throw
    "_throw('": `throw new Error('[nestify-js error] `,
    '_throw(`': 'throw new Error(`[nestify-js error] ',
    '_throw("': `throw new Error("[nestify-js error] `,
    '_throw(': `throw new Error("[nestify-js error] "+`,
    'declare const __IS_PROD__: boolean;\n': '',
    'const __IS_PROD__: boolean;\n': '',
    'logger.info(': "console.log(`%cinfo - __func__:`, 'color:#007ACC',",
    'logger.warn(': "console.log(`%cwarn - __func__:`, 'color:#ff9900',",
    'logger.error(': "console.log(`%cerror - __func__:`, 'color:#fb2c36',",
    'logger.debug(': "console.log(`%cdebug - __func__:`, 'color:#8617a5',",
    'logger.succ(': "console.log(`%cdebug - __func__:`, 'color:#00a00b',",
    'logger.verbose(': "console.log(`%cdebug - __func__:`, 'color:#10aaaf',",
    'logger.WorkspaceNotFound(': "console.log(`%cerror - __func__:`, 'color:#fb2c36','Workspace not found, id:',",
    'logger.TabNotFoundInWorkspace(':
      "console.log(`%cerror - __func__:`, 'color:#fb2c36','Tab not found in workspace. tabid,workspaceid:',",
  });

// Format date for package info
function dtm(dt = new Date()) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  const ms = String(dt.getMilliseconds()).padStart(3, '0');
  return `${y}.${m}.${d} ${hh}:${mm}:${ss}.${ms}`;
}

const __KEBAB_NAME__ = (process.env.KSKB_TSUMUGI_REAL_NAME ?? '').replace('rollup-plugin-', '');
const __NAME__ = __KEBAB_NAME__.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());

const __PKG_INFO__ = `## About
 * @package ${__NAME__}
 * @author ${pkg.author.name} <${pkg.author.email}>
 * @version ${pkg.version} (Last Update: ${dtm()})
 * @license ${pkg.license}
 * @link ${pkg.repository.url}
 * @link https://baendlorel.github.io/ Welcome to my site!
 * @description ${pkg.description.replace(/\n/g, '\n * \n * ')}
 * @copyright Copyright (c) ${new Date().getFullYear()} ${pkg.author.name}. All rights reserved.`;
