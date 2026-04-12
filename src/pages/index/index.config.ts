export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '记一笔' })
  : { navigationBarTitleText: '记一笔' }
