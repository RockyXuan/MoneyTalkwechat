export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '统计' })
  : { navigationBarTitleText: '统计' }
