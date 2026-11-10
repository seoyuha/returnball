// 영어 리턴볼 — 기본 문제 은행 (6학년 영어 11·12단원)
// 한 줄 = [질문, 정답 응답, 오답1, 오답2, 그림(선택: {e:이모지 또는 img/파일, cap:상황 설명}), 해설]
const UNITS = {
  11: { title: 'Do You Know About Songpyeon?', short: '전통문화', court: '전통문화 코트' },
  12: { title: 'We Should Save the World', short: '환경 보호', court: '환경 보호 코트' },
};

const BANK = {
  11: [
    ['What is yutnori?', "It's a traditional Korean game.", "It's a Korean rice cake.", "It's a traditional Korean house.", null, '윷놀이는 전통 놀이(game)'],
    ['What is songpyeon?', "It's a Korean rice cake.", "It's a traditional Korean game.", "It's a traditional Korean hat.", null, '송편은 떡(rice cake)'],
    ['What is hanok?', "It's a traditional Korean house.", "It's traditional Korean paper.", "It's a Korean rice cake.", null, '한옥은 전통 집(house)'],
    ['What is gat?', "It's a traditional Korean hat.", "It's a traditional Korean house.", "It's a traditional Korean game.", null, '갓은 전통 모자(hat)'],
    ['What is Hanji?', "It's traditional Korean paper.", "It's a traditional Korean hat.", "It's a Korean soup.", null, '한지는 전통 종이(paper)'],
    ['What is hanbok?', "It's traditional Korean clothes.", "It's traditional Korean paper.", "It's a traditional Korean game.", null, '한복은 전통 옷(clothes)'],
    ['What is Tuho?', "It's a traditional Korean game.", "It's a traditional Korean hat.", "It's a Korean rice cake.", null, '투호는 전통 놀이(game)'],
    ['What is tteokguk?', "It's a traditional Korean soup.", "It's a traditional Korean house.", "It's traditional Korean paper.", null, '떡국은 전통 국(soup)'],
    ['What is Gonggi?', "It's a traditional Korean game.", "It's traditional Korean clothes.", "It's a Korean soup.", null, '공기놀이는 전통 놀이(game)'],
    ['Do you know about songpyeon?', "Yes, I do. It's a Korean rice cake.", "Yes, I do. It's a traditional Korean hat.", "No, it's very salty.", null, '알면 Yes, I do. + 설명'],
    ['Do you know about hanok?', "Yes, I do. It's a traditional Korean house.", "Yes, I do. It's a Korean rice cake.", 'No, I am.', null, '한옥 = house'],
    ['Do you know about Hanji?', "No, I don't. What is it?", "It's sweet.", 'Yes, I am.', null, "모를 때 No, I don't."],
    ['Do you know about Tuho?', "Yes, I do. It's a traditional Korean game.", 'No, I do.', "Yes, I don't.", null, 'Do you ~? → Yes, I do. / No, I don\'t.'],
    ['Do you know about kimchi?', "Yes, I do. It's a traditional Korean food.", "Yes, I do. It's a traditional Korean game.", 'No, I am not.', null, '김치 = 전통 음식(food)'],
    ['How about making songpyeon?', 'Sounds good.', 'Yes, I do.', "It's a hat.", null, 'How about ~? 제안에는 Sounds good.'],
    ['How about playing Tuho?', "Good idea! Let's play.", "It's delicious.", "No, I don't know.", null, '제안에 찬성: Good idea!'],
    ['How about trying on hanbok?', 'That sounds fun.', "It's salty.", "Yes, it's a house.", null, 'try on = 입어 보다'],
    ['How about making Hanji?', 'Sounds great!', 'Here you are.', "It's a house.", null, '제안에 찬성: Sounds great!'],
    ['When do we eat songpyeon?', 'We eat it on Chuseok.', 'We eat it on Christmas.', 'We play it on Seollal.', null, '송편은 추석(Chuseok)'],
    ['When do we eat tteokguk?', 'We eat it on Seollal.', 'We eat it on Chuseok.', 'We wear it on Seollal.', null, '떡국은 설날(Seollal)'],
    ['What do people wear on Seollal?', 'They wear hanbok.', 'They eat hanbok.', 'They play hanbok.', null, '옷은 wear(입다)'],
    ['What can we make with Hanji?', 'We can make a kite.', 'We can eat it.', 'We can wear it on our head.', null, '한지로 연(kite)을 만들 수 있어요.'],
    ['What do we do on Chuseok?', 'We make songpyeon.', 'We make a snowman.', 'We go to the beach.', null, '추석에는 송편을 빚어요.'],
    ['Can you play yutnori?', "Yes, I can. It's fun.", "Yes, I do. It's a hat.", "No, it's a house.", null, 'Can you ~? → Yes, I can.'],
  ],
  12: [
    ['What should we do to save energy?', 'Turn off the lights.', 'Turn on the lights.', 'Use more electricity.', { e: '🏫💡', cap: '아무도 없는 교실에 불이 켜져 있어요.' }, '불을 끄면 에너지를 아껴요.'],
    ['What should we do to save water?', 'Turn off the water.', 'Turn on the water.', 'Take a long shower.', { e: '🚰💧', cap: '아무도 없는데 물이 계속 나와요.' }, '물을 잠가요 = turn off the water'],
    ['What should we do with cans and bottles?', 'We should recycle them.', 'We should throw them in the river.', 'We should break them.', { e: '🥫🍾', cap: '다 마신 캔과 병이 있어요.' }, 'recycle = 재활용하다'],
    ['How can we save the forest?', 'We should reuse paper.', 'We should cut down trees.', 'We should throw away paper.', { e: '🌳📄', cap: '종이를 한 번만 쓰고 버리려고 해요.' }, 'reuse = 다시 쓰다'],
    ['What should we use instead of paper cups?', 'We should use our own cups.', 'We should use more paper cups.', 'We should buy plastic bags.', { e: '🥤', cap: '종이컵이 잔뜩 쌓여 있어요.' }, '내 컵 쓰기 = use our own cups'],
    ['How can we save energy at school?', 'We should use the stairs.', 'We should use the elevator.', 'We should turn on the TV.', { e: '🛗', cap: '2층에 가려고 엘리베이터 앞에 서 있어요.' }, '계단 = stairs'],
    ['What should we do to keep the Earth clean?', 'We should pick up trash.', 'We should throw trash on the street.', 'We should use plastic bags.', { e: '🌍🗑️', cap: '길에 쓰레기가 떨어져 있어요.' }, 'pick up trash = 쓰레기를 줍다'],
    ['How can we keep the air clean?', 'We should ride a bike.', 'We should drive a car everywhere.', 'We should burn trash.', { e: '🚲', cap: '가까운 곳에 가려고 해요.' }, '자전거를 타면 공기가 깨끗해져요.'],
    ["Don't forget to turn off the light.", "Okay, I won't forget.", "No, I don't.", "It's a traditional Korean game.", null, "Don't forget ~ → Okay."],
    ["Don't forget to recycle cans.", 'Sure. We should save the Earth.', "Yes, I do. It's delicious.", "I'll throw them away.", null, '알겠다고 대답: Sure.'],
    ["Don't forget to use the stairs.", "Okay. Let's save energy.", "Let's take the elevator.", "No, thank you. I'm full.", null, '계단 이용 → 에너지 절약'],
    ['Why should we save water?', 'Because we need clean water.', 'Because water is sweet.', 'Because I like plastic.', null, '깨끗한 물이 필요하니까요.'],
    ['What can we do for the Earth?', 'We can recycle bottles.', 'We can waste water.', 'We can use more plastic bags.', null, '지구를 위해 병을 재활용해요.'],
    ['What should we bring to the market?', 'We should bring our own bag.', 'We should get many plastic bags.', 'We should bring paper cups.', { e: '🛍️', cap: '장을 보러 가요.' }, '장바구니를 가져가요.'],
    ['What should we do with old clothes?', 'We should reuse them.', 'We should burn them.', 'We should throw them in the sea.', { e: '👕', cap: '작아서 못 입는 옷이 있어요.' }, '헌 옷은 다시 써요(reuse).'],
    ['How about using a cup?', "Good idea! Let's save paper cups.", "No, let's use more paper cups.", "Yes, I do. It's a hat.", null, '제안에 찬성: Good idea!'],
    ['The Earth is sick. What should we do?', 'We should save the world.', 'We should waste energy.', 'We should cut down the forest.', { e: '🌏🤒', cap: '지구가 아파요.' }, 'We should save the world.'],
    ['What should we do when we leave the room?', 'Turn off the lights.', 'Leave the lights on.', 'Turn on the heater.', { e: '🚪💡', cap: '교실을 나가려고 해요.' }, '나갈 때는 불을 꺼요.'],
    ['Where should we put plastic bottles?', 'In the recycling bin.', 'In the river.', 'On the street.', { e: '♻️', cap: '다 마신 페트병이 있어요.' }, 'recycling bin = 분리수거함'],
    ["Don't use plastic bags.", "Okay. I'll use my own bag.", "Okay. I'll buy more plastic bags.", 'Sounds delicious.', null, '비닐봉지 대신 내 가방'],
    ['What should we do to save energy at home?', 'Turn off the TV.', 'Turn up the TV.', 'Watch TV all day.', { e: '📺', cap: '아무도 안 보는데 TV가 켜져 있어요.' }, 'turn off = 끄다'],
    ['How can we save paper?', 'We should use both sides of paper.', 'We should use a new sheet every time.', 'We should tear paper.', { e: '📝', cap: '종이 한쪽 면만 쓰고 버리려 해요.' }, '종이 양면 쓰기'],
  ],
};

function buildQuestions() {
  const out = [];
  for (const [unit, rows] of Object.entries(BANK)) {
    rows.forEach((r, i) => out.push({ id: `u${unit}-${String(i + 1).padStart(2, '0')}`, unit: Number(unit), q: r[0], answer: r[1], wrong: [r[2], r[3]], pic: r[4] || null, exp: r[5] || '', base: true }));
  }
  return out;
}

module.exports = { UNITS, buildQuestions };
