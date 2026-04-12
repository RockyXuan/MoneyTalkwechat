export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/bills/index',
    'pages/stats/index',
    'pages/profile/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#F7F5F0',
    navigationBarTitleText: '记一笔',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#3D7C5F',
    backgroundColor: '#FFFFFF',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '记一笔',
        iconPath: './assets/tabbar/pen-line.png',
        selectedIconPath: './assets/tabbar/pen-line-active.png',
      },
      {
        pagePath: 'pages/bills/index',
        text: '账单',
        iconPath: './assets/tabbar/receipt.png',
        selectedIconPath: './assets/tabbar/receipt-active.png',
      },
      {
        pagePath: 'pages/stats/index',
        text: '统计',
        iconPath: './assets/tabbar/chart-no-axes-column.png',
        selectedIconPath: './assets/tabbar/chart-no-axes-column-active.png',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: './assets/tabbar/user.png',
        selectedIconPath: './assets/tabbar/user-active.png',
      }
    ]
  }
})
