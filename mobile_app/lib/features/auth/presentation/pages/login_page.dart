import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../providers/login_controller.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _usernameController = TextEditingController(text: 'LetouMe 用户');
  final _passwordController = TextEditingController(text: 'password');
  bool _isSubmitting = false;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              theme.colorScheme.primary.withValues(alpha: 0.95),
              theme.colorScheme.secondary.withValues(alpha: 0.86),
              theme.scaffoldBackgroundColor,
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                padding: AppSpacing.screen,
                child: PanelCard(
                  padding: const EdgeInsets.all(AppSpacing.xl),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('LetouMe', style: theme.textTheme.displaySmall),
                      const SizedBox(height: AppSpacing.sm),
                      Text('把预测、历史、投注与消息放进一个真正适合移动端的入口。', style: theme.textTheme.bodyLarge),
                      const SizedBox(height: AppSpacing.xl),
                      TextField(
                        controller: _usernameController,
                        decoration: const InputDecoration(labelText: '用户名'),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      TextField(
                        controller: _passwordController,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: '密码'),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _isSubmitting
                              ? null
                              : () async {
                                  setState(() => _isSubmitting = true);
                                  try {
                                    await ref.read(loginControllerProvider).signIn(
                                          username: _usernameController.text.trim(),
                                          password: _passwordController.text.trim(),
                                        );
                                    if (mounted) {
                                      context.go(AppRoute.prediction.path);
                                    }
                                  } catch (error) {
                                    if (mounted) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(content: Text(error.toString())),
                                      );
                                    }
                                  } finally {
                                    if (mounted) {
                                      setState(() => _isSubmitting = false);
                                    }
                                  }
                                },
                          child: Text(_isSubmitting ? '登录中...' : '登录'),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text('当前为演示登录流程，后续可接入现有 FastAPI 认证接口。', style: theme.textTheme.bodyMedium),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
