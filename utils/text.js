/**
 * 过滤
 * @param msg
 */
export function filterResponseChunk(msg) {
  if (!msg || typeof msg !== 'string') {
    return false;
  }
  let trimmedMsg = msg.trim();
  if (!trimmedMsg) {
    return false;
  }
  if (trimmedMsg === '```') {
    return false;
  }
  if (trimmedMsg === '<EMPTY>') {
    return false;
  }
  // 内联 trimSpecific 的逻辑
  const marker = '<EMPTY>';
  const regex = new RegExp(`^${marker}|${marker}$`, 'g');
  trimmedMsg = trimmedMsg.replace(regex, '').trim();

  return trimmedMsg;
}

export function customSplitRegex(text, regex, limit) {
  const result = [];
  let match;
  let lastIndex = 0;
  const globalRegex = new RegExp(regex, 'g');

  while ((match = globalRegex.exec(text)) !== null) {
    if (result.length < limit - 1) {
      result.push(text.slice(lastIndex, match.index));
      lastIndex = match.index + match[0].length;
    } else {
      break;
    }
  }

  // 添加剩余部分
  result.push(text.slice(lastIndex));
  return result;
}

// *** 以下函数已内联到 filterResponseChunk 中，可删除 ***
// export function trimSpecific (str, marker) {
//   let trimmedStr = str.trim()

//   const regex = new RegExp(`^${marker}|${marker}$`, 'g')

//   return trimmedStr.replace(regex, '').trim()
// }