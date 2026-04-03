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
}
