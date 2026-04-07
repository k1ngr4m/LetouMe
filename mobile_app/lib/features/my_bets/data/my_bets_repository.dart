import '../../../core/network/api_client.dart';
import 'models/my_bet_record.dart';

class MyBetsRepository {
  MyBetsRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<MyBetRecordListResponse> listRecords({String lotteryCode = 'dlt'}) async {
    final data = await _apiClient.post(
      '/my-bets/list',
      data: {'lottery_code': lotteryCode},
    );
    return MyBetRecordListResponse.fromMap(data);
  }

  Future<MyBetRecord> updateRecord(UpdateMyBetPayload payload) async {
    final data = await _apiClient.post(
      '/my-bets/update',
      data: payload.toMap(),
    );
    return MyBetRecord.fromMap(
      data['record'] is Map<String, dynamic> ? data['record'] as Map<String, dynamic> : const {},
    );
  }
}
