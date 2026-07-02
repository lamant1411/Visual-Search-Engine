import { createBrowserRouter } from 'react-router'

import { AppShell } from '../components/layout/AppShell'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
    //   {
    //     index: true,
    //     element: <SearchPage />,
    //   },
    //   {
    //     path: 'search',
    //     element: <SearchPage />,
    //   },
    //   {
    //     path: 'history',
    //     element: <SearchHistoryPage />,
    //   },
    //   {
    //     path: 'admin',
    //     element: <AdminDashboardPage />,
    //   },
    ],
  },
//   {
//     path: '/login',
//     element: <LoginPage />,
//   },
//   {
//     path: '/register',
//     element: <RegisterPage />,
//   },
])