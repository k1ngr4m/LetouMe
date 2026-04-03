import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/feature_page_scaffold.dart';
import '../../../../shared/widgets/panel_card.dart';
import '../../../prediction/presentation/providers/prediction_overview_provider.dart';
import '../providers/messages_provider.dart';

class MessagesPage extends ConsumerWidget {
  const MessagesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final lotteryCode = ref.watch(selectedLotteryCodeProvider);
    final messagesAsync = ref.watch(messagesListProvider);
    final unreadAsync = ref.watch(unreadMessageCountProvider);
    return FeaturePageScaffold(
      title: '消息中心',
      actions: [
        IconButton(
          onPressed: () async {
            await ref.read(messagesRepositoryProvider).markAllRead(lotteryCode: lotteryCode);
            ref.invalidate(messagesListProvider);
            ref.invalidate(unreadMessageCountProvider);
          },
          icon: const Icon(Icons.done_all),
        ),
      ],
      children: [
        PanelCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('未读消息', style: theme.textTheme.titleMedium),
                    const SizedBox(height: AppSpacing.xs),
                    unreadAsync.when(
                      data: (count) => Text('$count 条待处理通知', style: theme.textTheme.bodyLarge),
                      loading: () => Text('加载中...', style: theme.textTheme.bodyLarge),
                      error: (error, stack) => Text('读取失败', style: theme.textTheme.bodyLarge),
                    ),
                  ],
                ),
              ),
              FilledButton.tonal(
                onPressed: () {
                  ref.invalidate(messagesListProvider);
                  ref.invalidate(unreadMessageCountProvider);
                },
                child: const Text('刷新'),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        ...messagesAsync.when(
          data: (response) => response.messages
              .map(
                (message) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: PanelCard(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(
                        child: Text(message.targetPeriod.isEmpty ? '-' : message.targetPeriod.substring(message.targetPeriod.length - 1)),
                      ),
                      title: Text(message.title),
                      subtitle: Text(
                        '${message.content}\n${message.createdAt}',
                        style: theme.textTheme.bodyMedium,
                      ),
                      isThreeLine: true,
                      trailing: message.isRead
                          ? const Icon(Icons.mark_email_read_outlined)
                          : const Icon(Icons.mark_email_unread_outlined),
                      onTap: () async {
                        if (!message.isRead) {
                          await ref.read(messagesRepositoryProvider).markRead(message.id);
                          ref.invalidate(messagesListProvider);
                          ref.invalidate(unreadMessageCountProvider);
                        }
                      },
                    ),
                  ),
                ),
              )
              .toList(),
          loading: () => const [
            Padding(
              padding: EdgeInsets.only(top: AppSpacing.lg),
              child: Center(child: CircularProgressIndicator()),
            ),
          ],
          error: (error, stack) => [
            Text('消息加载失败：$error'),
          ],
        ),
      ],
    );
  }
}
