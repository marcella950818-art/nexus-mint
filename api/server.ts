import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!, 
  process.env.SUPABASE_ANON_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method === 'POST') {
    const { url } = req.body;
    // 存入 Supabase 云端
    const { data, error } = await supabase
      .from('links')
      .insert([{ url, title: '捕获成功' }]);
    
    return res.status(200).json({ success: true });
  }

  if (req.method === 'GET') {
    // 从 Supabase 读取
    const { data } = await supabase.from('links').select('*');
    return res.status(200).json(data);
  }
}
