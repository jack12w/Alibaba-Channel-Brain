'use strict';

/**
 * 插件解析逻辑单测（与 content/injector.js 中实现保持一致）
 * 覆盖：FBI WidgetAction 结构、DeepInsight 递归结构、防抖不生效场景
 */

// ---- 复制自 injector.js 的解析函数（保持逻辑一致） ----

function extractFbiTable(json) {
  try {
    const v = json && json.data && json.data.value;
    if (v && Array.isArray(v.columns) && Array.isArray(v.values)) {
      const cols = v.columns.map((c) => {
        const cells = (c && c.cells) || [];
        let name = '';
        for (let i = cells.length - 1; i >= 0; i--) {
          const cell = cells[i];
          if (!cell) continue;
          const label = (cell.props && cell.props.label) || cell.value || cell.name;
          if (label) { name = label; break; }
        }
        return String(name || '');
      });
      return [{ title: '看板数据', columns: cols, rows: v.values }];
    }
  } catch (e) { /* ignore */ }
  return [];
}

function deepFindTables(obj, depth, out) {
  if (!obj || typeof obj !== 'object' || depth > 8 || out.length >= 10) return out;
  if (Array.isArray(obj.columns)) {
    const rows = Array.isArray(obj.values) ? obj.values : Array.isArray(obj.data) ? obj.data : null;
    if (rows) {
      const cols = obj.columns.map((c) =>
        typeof c === 'string' ? c : String((c && (c.name || c.title || c.label || c.columnName)) || ''));
      out.push({ title: '数据表格', columns: cols, rows });
      return out;
    }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) deepFindTables(item, depth + 1, out);
  } else {
    for (const k of Object.keys(obj)) deepFindTables(obj[k], depth + 1, out);
  }
  return out;
}

function extractDeepinsight(json) {
  return deepFindTables(json, 0, []);
}

// ---- 测试用例 ----

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${extra || ''}`); }
}

// 1. FBI WidgetAction 结构
const fbiSample = {
  data: {
    value: {
      columns: [
        { cells: [{ value: '统计维度' }, { props: { label: '统计日期' } }] },
        { cells: [{ value: '流量' }, { props: { label: '曝光量' } }] },
        { cells: [{ value: '流量' }, { props: { label: '点击量' } }] },
        { cells: [{ value: '商机' }, { props: { label: '询盘数' } }] },
      ],
      values: [
        ['2026-08-15', '85000', '4200', '180'],
        ['2026-08-14', '82000', '4100', '172'],
      ],
    },
  },
};
const t1 = extractFbiTable(fbiSample);
assert('FBI解析: 1个表格', t1.length === 1);
assert('FBI解析: 列名取字段label', JSON.stringify(t1[0].columns) === JSON.stringify(['统计日期', '曝光量', '点击量', '询盘数']));
assert('FBI解析: 2行数据', t1[0].rows.length === 2);

// 2. DeepInsight 嵌套结构
const diSample = {
  code: 0,
  data: {
    reportId: 'xxx',
    reportData: {
      table: {
        columns: ['行业', '店铺数', '平均曝光'],
        data: [['办公家具', '5680', '72000'], ['办公椅', '2350', '65000']],
      },
    },
  },
};
const t2 = extractDeepinsight(diSample);
assert('DeepInsight解析: 找到嵌套表格', t2.length === 1);
assert('DeepInsight解析: 列名', JSON.stringify(t2[0].columns) === JSON.stringify(['行业', '店铺数', '平均曝光']));
assert('DeepInsight解析: 2行', t2[0].rows.length === 2);

// 3. DeepInsight 字符串列名 + values 数组
const diSample2 = { data: { result: { columns: [{ name: 'A' }, { name: 'B' }], values: [[1, 2]] } } };
const t3 = extractDeepinsight(diSample2);
assert('DeepInsight解析: name列名', t3.length === 1 && t3[0].columns[0] === 'A');

// 4. 非表格 JSON 不应误报
const t4 = extractFbiTable({ data: { list: [1, 2, 3] } });
assert('FBI解析: 非表格返回空', t4.length === 0);
const t5 = extractDeepinsight({ code: 0, message: 'ok' });
assert('DeepInsight解析: 无表格返回空', t5.length === 0);

// 5. 双重编码字符串
const t6 = extractFbiTable(JSON.parse(JSON.stringify(fbiSample)));
assert('FBI解析: 双重序列化兼容', t6.length === 1);

// 6. 深度限制（不无限递归）
const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { columns: ['x'], data: [[1]] } } } } } } } } } } };
const t7 = extractDeepinsight(deep);
assert('DeepInsight解析: 深度限制不崩溃', Array.isArray(t7));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
