import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/pages/login_page.dart';
import '../features/history/presentation/pages/history_page.dart';
import '../features/history/presentation/pages/history_detail_page.dart';
import '../features/messages/presentation/pages/messages_page.dart';
import '../features/model_detail/presentation/pages/model_detail_page.dart';
import '../features/my_bets/presentation/pages/my_bets_page.dart';
import '../features/prediction/presentation/pages/prediction_home_page.dart';
import '../features/profile/presentation/pages/profile_page.dart';
import '../features/rules/presentation/pages/rules_page.dart';
import '../shared/navigation/app_shell_frame.dart';
import '../shared/providers/auth_state_provider.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: authState.isLoggedIn ? AppRoute.prediction.path : AppRoute.login.path,
    redirect: (context, state) {
      if (authState.isInitializing) {
        return state.uri.path == AppRoute.bootstrap.path ? null : AppRoute.bootstrap.path;
      }
      if (state.uri.path == AppRoute.bootstrap.path) {
        return authState.isLoggedIn ? AppRoute.prediction.path : AppRoute.login.path;
      }
      final isLoginRoute = state.uri.path == AppRoute.login.path;
      if (!authState.isLoggedIn && !isLoginRoute) {
        return AppRoute.login.path;
      }
      if (authState.isLoggedIn && isLoginRoute) {
        return AppRoute.prediction.path;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: AppRoute.bootstrap.path,
        name: AppRoute.bootstrap.name,
        builder: (context, state) => const _BootstrapPage(),
      ),
      GoRoute(
        path: AppRoute.login.path,
        name: AppRoute.login.name,
        builder: (context, state) => const LoginPage(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => AppShellFrame(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoute.prediction.path,
                name: AppRoute.prediction.name,
                builder: (context, state) => const PredictionHomePage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoute.history.path,
                name: AppRoute.history.name,
                builder: (context, state) => const HistoryPage(),
                routes: [
                  GoRoute(
                    path: ':targetPeriod',
                    name: AppRoute.historyDetail.name,
                    builder: (context, state) => HistoryDetailPage(
                      targetPeriod: state.pathParameters['targetPeriod'] ?? '',
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoute.myBets.path,
                name: AppRoute.myBets.name,
                builder: (context, state) => const MyBetsPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoute.messages.path,
                name: AppRoute.messages.name,
                builder: (context, state) => const MessagesPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoute.profile.path,
                name: AppRoute.profile.name,
                builder: (context, state) => const ProfilePage(),
                routes: [
                  GoRoute(
                    path: AppRoute.rules.subPath,
                    name: AppRoute.rules.name,
                    builder: (context, state) => const RulesPage(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '${AppRoute.prediction.path}/models/:modelCode',
        name: AppRoute.modelDetail.name,
        builder: (context, state) => ModelDetailPage(modelCode: state.pathParameters['modelCode'] ?? ''),
      ),
    ],
  );
});

enum AppRoute {
  bootstrap('/bootstrap'),
  login('/login'),
  prediction('/prediction'),
  history('/history'),
  historyDetail('/history/detail'),
  myBets('/my-bets'),
  messages('/messages'),
  profile('/profile'),
  rules('/profile/rules'),
  modelDetail('/prediction/models/detail');

  const AppRoute(this.path);

  final String path;

  String get name => switch (this) {
        bootstrap => 'bootstrap',
        login => 'login',
        prediction => 'prediction',
        history => 'history',
        historyDetail => 'history-detail',
        myBets => 'my-bets',
        messages => 'messages',
        profile => 'profile',
        rules => 'rules',
        modelDetail => 'model-detail',
      };

  String get subPath => path.split('/').last;
}

class _BootstrapPage extends StatelessWidget {
  const _BootstrapPage();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}
