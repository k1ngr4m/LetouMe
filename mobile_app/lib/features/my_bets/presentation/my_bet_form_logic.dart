import '../data/models/my_bet_record.dart';

const List<String> dltPlayTypes = ['dlt', 'dlt_dantuo'];
const List<String> pl3PlayTypes = ['direct', 'group3', 'group6', 'direct_sum', 'group_sum'];
const List<String> pl5PlayTypes = ['direct'];

const Map<int, int> pl3DirectSumBetCounts = {
  0: 1,
  1: 3,
  2: 6,
  3: 10,
  4: 15,
  5: 21,
  6: 28,
  7: 36,
  8: 45,
  9: 55,
  10: 63,
  11: 69,
  12: 73,
  13: 75,
  14: 75,
  15: 73,
  16: 69,
  17: 63,
  18: 55,
  19: 45,
  20: 36,
  21: 28,
  22: 21,
  23: 15,
  24: 10,
  25: 6,
  26: 3,
  27: 1,
};

final Map<int, int> pl3GroupSumBetCounts = _buildPl3GroupSumBetCounts();

Map<int, int> _buildPl3GroupSumBetCounts() {
  final counts = {for (var index = 0; index < 28; index += 1) index: 0};
  for (var first = 0; first <= 9; first += 1) {
    for (var second = first; second <= 9; second += 1) {
      for (var third = second; third <= 9; third += 1) {
        if (first == second && second == third) continue;
        final sumValue = first + second + third;
        counts[sumValue] = (counts[sumValue] ?? 0) + 1;
      }
    }
  }
  return counts;
}

class EditableBetLine {
  const EditableBetLine({
    required this.playType,
    this.frontNumbers = '',
    this.backNumbers = '',
    this.frontDan = '',
    this.frontTuo = '',
    this.backDan = '',
    this.backTuo = '',
    this.directTenThousands = '',
    this.directThousands = '',
    this.directHundreds = '',
    this.directTens = '',
    this.directUnits = '',
    this.groupNumbers = '',
    this.sumValues = '',
    this.multiplier = 1,
    this.isAppend = false,
  });

  final String playType;
  final String frontNumbers;
  final String backNumbers;
  final String frontDan;
  final String frontTuo;
  final String backDan;
  final String backTuo;
  final String directTenThousands;
  final String directThousands;
  final String directHundreds;
  final String directTens;
  final String directUnits;
  final String groupNumbers;
  final String sumValues;
  final int multiplier;
  final bool isAppend;

  EditableBetLine copyWith({
    String? playType,
    String? frontNumbers,
    String? backNumbers,
    String? frontDan,
    String? frontTuo,
    String? backDan,
    String? backTuo,
    String? directTenThousands,
    String? directThousands,
    String? directHundreds,
    String? directTens,
    String? directUnits,
    String? groupNumbers,
    String? sumValues,
    int? multiplier,
    bool? isAppend,
  }) {
    return EditableBetLine(
      playType: playType ?? this.playType,
      frontNumbers: frontNumbers ?? this.frontNumbers,
      backNumbers: backNumbers ?? this.backNumbers,
      frontDan: frontDan ?? this.frontDan,
      frontTuo: frontTuo ?? this.frontTuo,
      backDan: backDan ?? this.backDan,
      backTuo: backTuo ?? this.backTuo,
      directTenThousands: directTenThousands ?? this.directTenThousands,
      directThousands: directThousands ?? this.directThousands,
      directHundreds: directHundreds ?? this.directHundreds,
      directTens: directTens ?? this.directTens,
      directUnits: directUnits ?? this.directUnits,
      groupNumbers: groupNumbers ?? this.groupNumbers,
      sumValues: sumValues ?? this.sumValues,
      multiplier: multiplier ?? this.multiplier,
      isAppend: isAppend ?? this.isAppend,
    );
  }
}

class LineQuote {
  const LineQuote({
    required this.betCount,
    required this.amount,
    required this.valid,
    this.reason,
  });

  final int betCount;
  final int amount;
  final bool valid;
  final String? reason;
}

EditableBetLine editableLineFromRecord(String lotteryCode, MyBetLine line) {
  return EditableBetLine(
    playType: lotteryCode == 'dlt' ? (line.playType == 'dlt_dantuo' ? 'dlt_dantuo' : 'dlt') : line.playType,
    frontNumbers: line.frontNumbers.join(' '),
    backNumbers: line.backNumbers.join(' '),
    frontDan: line.frontDan.join(' '),
    frontTuo: line.frontTuo.join(' '),
    backDan: line.backDan.join(' '),
    backTuo: line.backTuo.join(' '),
    directTenThousands: line.directTenThousands.join(' '),
    directThousands: line.directThousands.join(' '),
    directHundreds: line.directHundreds.join(' '),
    directTens: line.directTens.join(' '),
    directUnits: line.directUnits.join(' '),
    groupNumbers: line.groupNumbers.join(' '),
    sumValues: line.sumValues.join(' '),
    multiplier: line.multiplier,
    isAppend: line.isAppend,
  );
}

EditableBetLine createEmptyEditableLine(String lotteryCode) {
  return EditableBetLine(playType: switch (lotteryCode) {
    'dlt' => 'dlt',
    'pl3' => 'direct',
    'pl5' => 'direct',
    _ => 'dlt',
  });
}

List<String> splitNumbers(String raw) {
  final items = raw
      .split(RegExp(r'[\s,，、;；|/]+'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .map((item) => item.padLeft(2, '0'))
      .toSet()
      .toList();
  items.sort();
  return items;
}

bool allInRange(List<String> values, int min, int max) {
  return values.every((item) {
    final value = int.tryParse(item);
    return value != null && value >= min && value <= max;
  });
}

bool hasIntersection(List<String> left, List<String> right) {
  final leftSet = left.toSet();
  return right.any(leftSet.contains);
}

int combination(int total, int choose) {
  if (choose < 0 || choose > total) return 0;
  if (choose == 0 || choose == total) return 1;
  final actualChoose = choose < total - choose ? choose : total - choose;
  var result = 1.0;
  for (var index = 1; index <= actualChoose; index += 1) {
    result = (result * (total - actualChoose + index)) / index;
  }
  return result.round();
}

LineQuote quoteLine(String lotteryCode, EditableBetLine line) {
  final multiplier = line.multiplier.clamp(1, 99);
  if (lotteryCode == 'dlt') {
    if (line.playType == 'dlt_dantuo') {
      final frontDan = splitNumbers(line.frontDan);
      final frontTuo = splitNumbers(line.frontTuo);
      final backDan = splitNumbers(line.backDan);
      final backTuo = splitNumbers(line.backTuo);
      if (!allInRange(frontDan, 1, 35) || !allInRange(frontTuo, 1, 35)) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '前区号码范围为 01-35');
      }
      if (!allInRange(backDan, 1, 12) || !allInRange(backTuo, 1, 12)) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '后区号码范围为 01-12');
      }
      final frontPickCount = 5 - frontDan.length;
      final backPickCount = 2 - backDan.length;
      if (frontDan.length < 1 || frontDan.length > 4) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '前区胆码数量应为 1-4 个');
      }
      if (frontTuo.length < 2) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '前区拖码至少 2 个');
      }
      if (hasIntersection(frontDan, frontTuo)) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '前区胆码与拖码不能重复');
      }
      if ((frontDan.followedBy(frontTuo).toSet()).length < 6) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '前区胆码拖码合计至少 6 个');
      }
      if (backDan.length > 1) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '后区胆码最多 1 个');
      }
      if (backTuo.length < 2) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '后区拖码至少 2 个');
      }
      if (hasIntersection(backDan, backTuo)) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '后区胆码与拖码不能重复');
      }
      if ((backDan.followedBy(backTuo).toSet()).length < 3) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '后区胆码拖码合计至少 3 个');
      }
      if (frontTuo.length < frontPickCount || backTuo.length < backPickCount) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '拖码数量不足以组成有效注单');
      }
      final betCount = combination(frontTuo.length, frontPickCount) * combination(backTuo.length, backPickCount);
      final amount = betCount * 2 * multiplier + (line.isAppend ? betCount * multiplier : 0);
      return LineQuote(betCount: betCount, amount: amount, valid: betCount > 0, reason: betCount > 0 ? null : '号码无效');
    }
    final front = splitNumbers(line.frontNumbers);
    final back = splitNumbers(line.backNumbers);
    if (!allInRange(front, 1, 35)) {
      return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '前区号码范围为 01-35');
    }
    if (!allInRange(back, 1, 12)) {
      return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '后区号码范围为 01-12');
    }
    if (front.length < 5) {
      return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '前区至少选择 5 个号码');
    }
    if (back.length < 2) {
      return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '后区至少选择 2 个号码');
    }
    final betCount = combination(front.length, 5) * combination(back.length, 2);
    final amount = betCount * 2 * multiplier + (line.isAppend ? betCount * multiplier : 0);
    return LineQuote(betCount: betCount, amount: amount, valid: betCount > 0, reason: betCount > 0 ? null : '号码无效');
  }

  if (line.playType == 'direct') {
    if (lotteryCode == 'pl5') {
      final tt = splitNumbers(line.directTenThousands);
      final th = splitNumbers(line.directThousands);
      final h = splitNumbers(line.directHundreds);
      final t = splitNumbers(line.directTens);
      final u = splitNumbers(line.directUnits);
      if (![tt, th, h, t, u].every((item) => allInRange(item, 0, 9))) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '排列5号码范围为 0-9');
      }
      if (tt.isEmpty || th.isEmpty || h.isEmpty || t.isEmpty || u.isEmpty) {
        return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '万千百十个位都需至少 1 个号码');
      }
      final betCount = tt.length * th.length * h.length * t.length * u.length;
      return LineQuote(betCount: betCount, amount: betCount * 2 * multiplier, valid: betCount > 0);
    }
    final h = splitNumbers(line.directHundreds);
    final t = splitNumbers(line.directTens);
    final u = splitNumbers(line.directUnits);
    if (![h, t, u].every((item) => allInRange(item, 0, 9))) {
      return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '排列3号码范围为 0-9');
    }
    if (h.isEmpty || t.isEmpty || u.isEmpty) {
      return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '百十个位都需至少 1 个号码');
    }
    final betCount = h.length * t.length * u.length;
    return LineQuote(betCount: betCount, amount: betCount * 2 * multiplier, valid: betCount > 0);
  }

  if (line.playType == 'direct_sum' || line.playType == 'group_sum') {
    final sumValues = splitNumbers(line.sumValues);
    if (!allInRange(sumValues, 0, 27)) {
      return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '和值范围为 00-27');
    }
    if (sumValues.isEmpty) {
      return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '和值至少选择 1 个');
    }
    final countRule = line.playType == 'direct_sum' ? pl3DirectSumBetCounts : pl3GroupSumBetCounts;
    final betCount = sumValues.fold<int>(0, (sum, item) => sum + (countRule[int.tryParse(item) ?? -1] ?? 0));
    return LineQuote(betCount: betCount, amount: betCount * 2 * multiplier, valid: betCount > 0, reason: betCount > 0 ? null : '和值无效');
  }

  final groups = splitNumbers(line.groupNumbers);
  if (!allInRange(groups, 0, 9)) {
    return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '组选号码范围为 0-9');
  }
  if (line.playType == 'group3' && groups.length < 2) {
    return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '组选3至少 2 个号码');
  }
  if (line.playType == 'group6' && groups.length < 3) {
    return const LineQuote(betCount: 0, amount: 0, valid: false, reason: '组选6至少 3 个号码');
  }
  final betCount = line.playType == 'group3' ? groups.length * (groups.length - 1) : combination(groups.length, 3);
  return LineQuote(betCount: betCount, amount: betCount * 2 * multiplier, valid: betCount > 0, reason: betCount > 0 ? null : '组选无效');
}

UpdateMyBetLinePayload buildUpdateLinePayload(String lotteryCode, EditableBetLine line) {
  final multiplier = line.multiplier.clamp(1, 99);
  if (lotteryCode == 'dlt') {
    if (line.playType == 'dlt_dantuo') {
      return UpdateMyBetLinePayload(
        playType: 'dlt_dantuo',
        frontDan: splitNumbers(line.frontDan),
        frontTuo: splitNumbers(line.frontTuo),
        backDan: splitNumbers(line.backDan),
        backTuo: splitNumbers(line.backTuo),
        multiplier: multiplier,
        isAppend: line.isAppend,
      );
    }
    return UpdateMyBetLinePayload(
      playType: 'dlt',
      frontNumbers: splitNumbers(line.frontNumbers),
      backNumbers: splitNumbers(line.backNumbers),
      multiplier: multiplier,
      isAppend: line.isAppend,
    );
  }
  if (line.playType == 'direct') {
    if (lotteryCode == 'pl5') {
      return UpdateMyBetLinePayload(
        playType: 'direct',
        directTenThousands: splitNumbers(line.directTenThousands),
        directThousands: splitNumbers(line.directThousands),
        directHundreds: splitNumbers(line.directHundreds),
        directTens: splitNumbers(line.directTens),
        directUnits: splitNumbers(line.directUnits),
        multiplier: multiplier,
        isAppend: false,
      );
    }
    return UpdateMyBetLinePayload(
      playType: 'direct',
      directHundreds: splitNumbers(line.directHundreds),
      directTens: splitNumbers(line.directTens),
      directUnits: splitNumbers(line.directUnits),
      multiplier: multiplier,
      isAppend: false,
    );
  }
  if (line.playType == 'direct_sum' || line.playType == 'group_sum') {
    return UpdateMyBetLinePayload(
      playType: line.playType,
      sumValues: splitNumbers(line.sumValues),
      multiplier: multiplier,
      isAppend: false,
    );
  }
  return UpdateMyBetLinePayload(
    playType: line.playType,
    groupNumbers: splitNumbers(line.groupNumbers),
    multiplier: multiplier,
    isAppend: false,
  );
}

String formatPlayType(String playType) {
  switch (playType) {
    case 'dlt_dantuo':
      return '胆拖';
    case 'group3':
      return '组选3';
    case 'group6':
      return '组选6';
    case 'direct_sum':
      return '直选和值';
    case 'group_sum':
      return '组选和值';
    case 'direct':
      return '直选';
    case 'mixed':
      return '混合';
    default:
      return '大乐透';
  }
}

String formatLinePreview(String lotteryCode, MyBetLine line) {
  if (lotteryCode == 'dlt') {
    if (line.playType == 'dlt_dantuo') {
      return '前胆 ${line.frontDan.join(' ')}｜前拖 ${line.frontTuo.join(' ')}'
          '${line.backDan.isEmpty ? '' : '｜后胆 ${line.backDan.join(' ')}'}'
          '${line.backTuo.isEmpty ? '' : '｜后拖 ${line.backTuo.join(' ')}'}';
    }
    return '${line.frontNumbers.join(' ')}${line.backNumbers.isEmpty ? '' : ' + ${line.backNumbers.join(' ')}'}';
  }
  if (line.playType == 'direct') {
    if (lotteryCode == 'pl5') {
      return [line.directTenThousands, line.directThousands, line.directHundreds, line.directTens, line.directUnits]
          .map((item) => item.join(' '))
          .join(' ｜ ');
    }
    return [line.directHundreds, line.directTens, line.directUnits].map((item) => item.join(' ')).join(' ｜ ');
  }
  if (line.playType == 'direct_sum' || line.playType == 'group_sum') {
    return '和值 ${line.sumValues.join(' ')}';
  }
  return '组选 ${line.groupNumbers.join(' ')}';
}

List<String> playTypeOptionsForLottery(String lotteryCode) {
  switch (lotteryCode) {
    case 'dlt':
      return dltPlayTypes;
    case 'pl3':
      return pl3PlayTypes;
    case 'pl5':
      return pl5PlayTypes;
    default:
      return const ['dlt'];
  }
}
