export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '统计', usingComponents: {} })
  : { navigationBarTitleText: '统计', usingComponents: {} }
