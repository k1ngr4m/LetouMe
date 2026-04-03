import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client_provider.dart';
import '../../../prediction/presentation/providers/prediction_overview_provider.dart';
import '../../data/messages_repository.dart';
import '../../data/models/site_message.dart';

final messagesRepositoryProvider = Provider<MessagesRepository>((ref) {
  return MessagesRepository(apiClient: ref.watch(apiClientProvider));
});

final messagesListProvider = FutureProvider<SiteMessageListResponse>((ref) {
  final lotteryCode = ref.watch(selectedLotteryCodeProvider);
  return ref.watch(messagesRepositoryProvider).listMessages(lotteryCode: lotteryCode);
});

final unreadMessageCountProvider = FutureProvider<int>((ref) {
  final lotteryCode = ref.watch(selectedLotteryCodeProvider);
  return ref.watch(messagesRepositoryProvider).getUnreadCount(lotteryCode: lotteryCode);
});
