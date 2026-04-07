import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client_provider.dart';
import '../../../prediction/presentation/providers/prediction_overview_provider.dart';
import '../../data/models/my_bet_record.dart';
import '../../data/my_bets_repository.dart';

final myBetsRepositoryProvider = Provider<MyBetsRepository>((ref) {
  return MyBetsRepository(apiClient: ref.watch(apiClientProvider));
});

final myBetsListProvider = FutureProvider<MyBetRecordListResponse>((ref) {
  final lotteryCode = ref.watch(selectedLotteryCodeProvider);
  return ref.watch(myBetsRepositoryProvider).listRecords(lotteryCode: lotteryCode);
});

final myBetDetailProvider = FutureProvider.family<MyBetRecord, int>((ref, recordId) async {
  final payload = await ref.watch(myBetsListProvider.future);
  return payload.records.firstWhere((record) => record.id == recordId);
});
