/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Online Workbench': 'Online Workbench',
    'Generate images and videos with an API key':
      'Generate images and videos with an API key',
    'Image generation': 'Image generation',
    'Video generation': 'Video generation',
    'Choose an enabled API key and a supported model':
      'Choose an enabled API key and a supported model',
    'Select an API key': 'Select an API key',
    'No enabled API keys found': 'No enabled API keys found',
    'No media models available': 'No media models available',
    'Select a model': 'Select a model',
    'Describe the image or video you want to create':
      'Describe the image or video you want to create',
    'Image size': 'Image size',
    'Custom size': 'Custom size',
    'Generation mode': 'Generation mode',
    'Text to video': 'Text to video',
    'Image to video': 'Image to video',
    'Upload an image': 'Upload an image',
    'Generate image': 'Generate image',
    'Generate video': 'Generate video',
    'Your generated image will appear here':
      'Your generated image will appear here',
    'Track the video task and preview the result here':
      'Track the video task and preview the result here',
    'No image generated yet': 'No image generated yet',
    'Video generation status': 'Video generation status',
    'Video progress': 'Video progress',
    'Preparing video preview': 'Preparing video preview',
    'No video task yet': 'No video task yet',
    'Failed to load video task': 'Failed to load video task',
    'Video generation failed': 'Video generation failed',
    'The video task failed': 'The video task failed',
    'Video generation started': 'Video generation started',
    'Please complete the required fields': 'Please complete the required fields',
    'No image was returned': 'No image was returned',
    'Invalid image size': 'Invalid image size',
    'Duration must be a positive integer':
      'Duration must be a positive integer',
    'Select an image file': 'Select an image file',
    'Failed to create video': 'Failed to create video',
    'Failed to load workbench data': 'Failed to load workbench data',
    'Please refresh the page and try again':
      'Please refresh the page and try again',
    'Aspect ratio': 'Aspect ratio',
    Resolution: 'Resolution',
  },
  zh: {
    'Online Workbench': '在线工作台',
    'Generate images and videos with an API key':
      '使用 API Key 生成图片和视频',
    'Image generation': '图片生成',
    'Video generation': '视频生成',
    'Choose an enabled API key and a supported model':
      '选择已启用的 API Key 和支持的模型',
    'Select an API key': '选择 API Key',
    'No enabled API keys found': '没有找到已启用的 API Key',
    'No media models available': '没有可用的媒体模型',
    'Select a model': '选择模型',
    'Describe the image or video you want to create': '描述要生成的图片或视频',
    'Image size': '图片尺寸',
    'Custom size': '自定义尺寸',
    'Generation mode': '生成模式',
    'Text to video': '文生视频',
    'Image to video': '图生视频',
    'Upload an image': '上传图片',
    'Generate image': '生成图片',
    'Generate video': '生成视频',
    'Your generated image will appear here': '生成的图片会显示在这里',
    'Track the video task and preview the result here':
      '在这里查看视频任务状态和结果',
    'No image generated yet': '尚未生成图片',
    'Video generation status': '视频生成状态',
    'Video progress': '视频进度',
    'Preparing video preview': '正在准备视频预览',
    'No video task yet': '尚未创建视频任务',
    'Failed to load video task': '加载视频任务失败',
    'Video generation failed': '视频生成失败',
    'The video task failed': '视频任务失败',
    'Video generation started': '视频生成已开始',
    'Please complete the required fields': '请填写必填字段',
    'No image was returned': '未返回图片',
    'Invalid image size': '图片尺寸无效',
    'Duration must be a positive integer': '时长必须是正整数',
    'Select an image file': '请选择图片文件',
    'Failed to create video': '创建视频失败',
    'Failed to load workbench data': '加载工作台数据失败',
    'Please refresh the page and try again': '请刷新页面后重试',
    'Aspect ratio': '画面比例',
    Resolution: '分辨率',
  },
  'zh-TW': {
    'Online Workbench': '線上工作台',
    'Generate images and videos with an API key':
      '使用 API Key 產生圖片和影片',
    'Image generation': '圖片產生',
    'Video generation': '影片產生',
    'Choose an enabled API key and a supported model':
      '選擇已啟用的 API Key 和支援的模型',
    'Select an API key': '選擇 API Key',
    'No enabled API keys found': '找不到已啟用的 API Key',
    'No media models available': '沒有可用的媒體模型',
    'Select a model': '選擇模型',
    'Describe the image or video you want to create': '描述要產生的圖片或影片',
    'Image size': '圖片尺寸',
    'Custom size': '自訂尺寸',
    'Generation mode': '產生模式',
    'Text to video': '文字轉影片',
    'Image to video': '圖片轉影片',
    'Upload an image': '上傳圖片',
    'Generate image': '產生圖片',
    'Generate video': '產生影片',
    'Your generated image will appear here': '產生的圖片會顯示在這裡',
    'Track the video task and preview the result here':
      '在這裡查看影片任務狀態和結果',
    'No image generated yet': '尚未產生圖片',
    'Video generation status': '影片產生狀態',
    'Video progress': '影片進度',
    'Preparing video preview': '正在準備影片預覽',
    'No video task yet': '尚未建立影片任務',
    'Failed to load video task': '載入影片任務失敗',
    'Video generation failed': '影片產生失敗',
    'The video task failed': '影片任務失敗',
    'Video generation started': '影片產生已開始',
    'Please complete the required fields': '請填寫必填欄位',
    'No image was returned': '未回傳圖片',
    'Invalid image size': '圖片尺寸無效',
    'Duration must be a positive integer': '時長必須是正整數',
    'Select an image file': '請選擇圖片檔案',
    'Failed to create video': '建立影片失敗',
    'Failed to load workbench data': '載入工作台資料失敗',
    'Please refresh the page and try again': '請重新整理頁面後再試',
    'Aspect ratio': '畫面比例',
    Resolution: '解析度',
  },
  fr: {
    'Online Workbench': 'Atelier en ligne',
    'Generate images and videos with an API key':
      'Générez des images et des vidéos avec une clé API',
    'Image generation': "Génération d'images",
    'Video generation': 'Génération de vidéos',
    'Choose an enabled API key and a supported model':
      'Choisissez une clé API active et un modèle compatible',
    'Select an API key': 'Sélectionnez une clé API',
    'No enabled API keys found': 'Aucune clé API active trouvée',
    'No media models available': 'Aucun modèle multimédia disponible',
    'Select a model': 'Sélectionnez un modèle',
    'Describe the image or video you want to create':
      "Décrivez l'image ou la vidéo à créer",
    'Image size': "Taille de l'image",
    'Custom size': 'Taille personnalisée',
    'Generation mode': 'Mode de génération',
    'Text to video': 'Texte vers vidéo',
    'Image to video': 'Image vers vidéo',
    'Upload an image': 'Importer une image',
    'Generate image': 'Générer une image',
    'Generate video': 'Générer une vidéo',
    'Your generated image will appear here':
      "L'image générée apparaîtra ici",
    'Track the video task and preview the result here':
      'Suivez la tâche vidéo et prévisualisez le résultat ici',
    'No image generated yet': 'Aucune image générée pour le moment',
    'Video generation status': 'État de la génération vidéo',
    'Video progress': 'Progression de la vidéo',
    'Preparing video preview': 'Préparation de l’aperçu vidéo',
    'No video task yet': 'Aucune tâche vidéo pour le moment',
    'Failed to load video task': 'Impossible de charger la tâche vidéo',
    'Video generation failed': 'Échec de la génération vidéo',
    'The video task failed': 'La tâche vidéo a échoué',
    'Video generation started': 'Génération vidéo démarrée',
    'Please complete the required fields': 'Remplissez les champs obligatoires',
    'No image was returned': 'Aucune image reçue',
    'Invalid image size': "Taille d'image invalide",
    'Duration must be a positive integer':
      'La durée doit être un entier positif',
    'Select an image file': 'Sélectionnez un fichier image',
    'Failed to create video': 'Échec de la création de la vidéo',
    'Failed to load workbench data':
      "Échec du chargement des données de l'atelier",
    'Please refresh the page and try again':
      'Actualisez la page et réessayez',
    'Aspect ratio': 'Format',
    Resolution: 'Résolution',
  },
  ja: {
    'Online Workbench': 'オンラインワークベンチ',
    'Generate images and videos with an API key':
      'API キーで画像と動画を生成',
    'Image generation': '画像生成',
    'Video generation': '動画生成',
    'Choose an enabled API key and a supported model':
      '有効な API キーと対応モデルを選択',
    'Select an API key': 'API キーを選択',
    'No enabled API keys found': '有効な API キーがありません',
    'No media models available': '利用可能なメディアモデルがありません',
    'Select a model': 'モデルを選択',
    'Describe the image or video you want to create':
      '生成する画像または動画を説明してください',
    'Image size': '画像サイズ',
    'Custom size': 'カスタムサイズ',
    'Generation mode': '生成モード',
    'Text to video': 'テキストから動画',
    'Image to video': '画像から動画',
    'Upload an image': '画像をアップロード',
    'Generate image': '画像を生成',
    'Generate video': '動画を生成',
    'Your generated image will appear here': '生成した画像がここに表示されます',
    'Track the video task and preview the result here':
      '動画タスクの状態と結果をここで確認できます',
    'No image generated yet': '画像はまだ生成されていません',
    'Video generation status': '動画生成の状態',
    'Video progress': '動画の進捗',
    'Preparing video preview': '動画プレビューを準備中',
    'No video task yet': '動画タスクはまだありません',
    'Failed to load video task': '動画タスクの読み込みに失敗しました',
    'Video generation failed': '動画生成に失敗しました',
    'The video task failed': '動画タスクが失敗しました',
    'Video generation started': '動画生成を開始しました',
    'Please complete the required fields': '必須項目を入力してください',
    'No image was returned': '画像が返されませんでした',
    'Invalid image size': '画像サイズが無効です',
    'Duration must be a positive integer': '長さは正の整数で指定してください',
    'Select an image file': '画像ファイルを選択してください',
    'Failed to create video': '動画の作成に失敗しました',
    'Failed to load workbench data': 'ワークベンチデータの読み込みに失敗しました',
    'Please refresh the page and try again': 'ページを更新して再試行してください',
    'Aspect ratio': 'アスペクト比',
    Resolution: '解像度',
  },
  ru: {
    'Online Workbench': 'Онлайн-рабочая область',
    'Generate images and videos with an API key':
      'Создавайте изображения и видео с помощью API-ключа',
    'Image generation': 'Генерация изображений',
    'Video generation': 'Генерация видео',
    'Choose an enabled API key and a supported model':
      'Выберите активный API-ключ и поддерживаемую модель',
    'Select an API key': 'Выберите API-ключ',
    'No enabled API keys found': 'Активные API-ключи не найдены',
    'No media models available': 'Нет доступных медиа-моделей',
    'Select a model': 'Выберите модель',
    'Describe the image or video you want to create':
      'Опишите изображение или видео, которое нужно создать',
    'Image size': 'Размер изображения',
    'Custom size': 'Пользовательский размер',
    'Generation mode': 'Режим генерации',
    'Text to video': 'Текст в видео',
    'Image to video': 'Изображение в видео',
    'Upload an image': 'Загрузить изображение',
    'Generate image': 'Создать изображение',
    'Generate video': 'Создать видео',
    'Your generated image will appear here':
      'Созданное изображение появится здесь',
    'Track the video task and preview the result here':
      'Отслеживайте задачу видео и просматривайте результат здесь',
    'No image generated yet': 'Изображение ещё не создано',
    'Video generation status': 'Статус генерации видео',
    'Video progress': 'Прогресс видео',
    'Preparing video preview': 'Подготовка предпросмотра видео',
    'No video task yet': 'Задача видео ещё не создана',
    'Failed to load video task': 'Не удалось загрузить задачу видео',
    'Video generation failed': 'Не удалось создать видео',
    'The video task failed': 'Задача видео завершилась ошибкой',
    'Video generation started': 'Генерация видео началась',
    'Please complete the required fields': 'Заполните обязательные поля',
    'No image was returned': 'Изображение не было получено',
    'Invalid image size': 'Недопустимый размер изображения',
    'Duration must be a positive integer':
      'Длительность должна быть положительным целым числом',
    'Select an image file': 'Выберите файл изображения',
    'Failed to create video': 'Не удалось создать видео',
    'Failed to load workbench data':
      'Не удалось загрузить данные рабочей области',
    'Please refresh the page and try again':
      'Обновите страницу и повторите попытку',
    'Aspect ratio': 'Соотношение сторон',
    Resolution: 'Разрешение',
  },
  vi: {
    'Online Workbench': 'Bàn làm việc trực tuyến',
    'Generate images and videos with an API key':
      'Tạo hình ảnh và video bằng API key',
    'Image generation': 'Tạo hình ảnh',
    'Video generation': 'Tạo video',
    'Choose an enabled API key and a supported model':
      'Chọn API key đang bật và model được hỗ trợ',
    'Select an API key': 'Chọn API key',
    'No enabled API keys found': 'Không tìm thấy API key đang bật',
    'No media models available': 'Không có model đa phương tiện khả dụng',
    'Select a model': 'Chọn model',
    'Describe the image or video you want to create':
      'Mô tả hình ảnh hoặc video bạn muốn tạo',
    'Image size': 'Kích thước hình ảnh',
    'Custom size': 'Kích thước tùy chỉnh',
    'Generation mode': 'Chế độ tạo',
    'Text to video': 'Văn bản thành video',
    'Image to video': 'Hình ảnh thành video',
    'Upload an image': 'Tải hình ảnh lên',
    'Generate image': 'Tạo hình ảnh',
    'Generate video': 'Tạo video',
    'Your generated image will appear here':
      'Hình ảnh được tạo sẽ xuất hiện ở đây',
    'Track the video task and preview the result here':
      'Theo dõi tác vụ video và xem trước kết quả tại đây',
    'No image generated yet': 'Chưa tạo hình ảnh',
    'Video generation status': 'Trạng thái tạo video',
    'Video progress': 'Tiến độ video',
    'Preparing video preview': 'Đang chuẩn bị xem trước video',
    'No video task yet': 'Chưa có tác vụ video',
    'Failed to load video task': 'Không tải được tác vụ video',
    'Video generation failed': 'Tạo video thất bại',
    'The video task failed': 'Tác vụ video thất bại',
    'Video generation started': 'Đã bắt đầu tạo video',
    'Please complete the required fields': 'Vui lòng điền các trường bắt buộc',
    'No image was returned': 'Không nhận được hình ảnh',
    'Invalid image size': 'Kích thước hình ảnh không hợp lệ',
    'Duration must be a positive integer': 'Thời lượng phải là số nguyên dương',
    'Select an image file': 'Chọn tệp hình ảnh',
    'Failed to create video': 'Tạo video thất bại',
    'Failed to load workbench data': 'Không tải được dữ liệu bàn làm việc',
    'Please refresh the page and try again':
      'Vui lòng làm mới trang rồi thử lại',
    'Aspect ratio': 'Tỷ lệ khung hình',
    Resolution: 'Độ phân giải',
  },
}

async function main() {
  let totalAdded = 0

  for (const [locale, translations] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))
    let count = 0

    for (const [key, value] of Object.entries(translations)) {
      if (!Object.prototype.hasOwnProperty.call(json.translation, key)) {
        json.translation[key] = value
        count++
      }
    }

    if (count > 0) {
      json.translation = Object.fromEntries(
        Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b))
      )
      await fs.writeFile(filePath, stableStringify(json), 'utf8')
    }

    console.log(`${locale}: ${count} translations applied`)
    totalAdded += count
  }

  console.log(`\nTotal: ${totalAdded} translations applied`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
