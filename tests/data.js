export const nodeInfo = {
  alias: 'alice',
  best_header_timestamp: Math.round(Date.now() / 1000),
  block_hash: Buffer.alloc(32).toString('hex'),
  block_height: 100,
  chains: [],
  color: '#000000',
  public_key: Buffer.alloc(33).toString('hex'),
  active_channels_count: 1,
  peers_count: 1,
  num_pending_channels: 1,
  synced_to_chain: true,
  version: 'version',
  uris: [''],
}

nodeInfo.uris = [`${nodeInfo.public_key}@127.0.0.1:19735`]

export const invoice =
  'lntb20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqc' +
  'yq5rqwzqfqypqhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy04' +
  '3l2ahrqsfpp3x9et2e20v6pu37c5d9vax37wxq72un98k6vcx9fz94w0qf23' +
  '7cm2rqv9pmn5lnexfvf5579slr4zq3u8kmczecytdx0xg9rwzngp7e6guwqp' +
  'qlhssu04sucpnz4axcv2dstmknqq6jsk2l'
