export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '分类详情' })
  : { navigationBarTitleText: '分类详情' }
