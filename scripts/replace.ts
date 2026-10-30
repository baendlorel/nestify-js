import replace from '@rollup/plugin-replace';
import pkg from '../package.json' with { type: 'json' };

export const replacePlugin = (): ReturnType<typeof replace.default> =>
  (replace as unknown as typeof replace.default)({
    preventAssignment: true,
    delimiters: ['', ''],
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
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
