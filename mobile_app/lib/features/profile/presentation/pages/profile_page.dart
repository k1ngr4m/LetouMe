import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/providers/auth_state_provider.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    return FeaturePageScaffold(
      title: '个人中心',
      children: [
        PanelCard(
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const CircleAvatar(child: Icon(Icons.person_outline)),
            title: Text(authState.displayName ?? '未登录用户'),
            subtitle: const Text('这里承接用户资料、通知偏好和辅助入口。'),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        PanelCard(
          child: Column(
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('规则说明'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push(AppRoute.rules.path),
              ),
              const Divider(),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('退出登录'),
                trailing: const Icon(Icons.logout),
                onTap: () {
                  ref.read(authStateProvider.notifier).signOut();
                  context.go(AppRoute.login.path);
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
