exports.seed = async function seed(knex) {
  // Очищаем в обратном порядке зависимостей, чтобы не нарушить внешние ключи
  await knex('progress').del();
  await knex('steps').del();
  await knex('themes').del();

  const [themeId] = await knex('themes').insert({ name: 'DevOps' });

  await knex('steps').insert([
    {
      theme_id: themeId,
      title: 'Основы Linux',
      description: 'Файловая система, права доступа, базовые команды терминала, systemd.',
      resource_url: 'https://linuxjourney.com/',
      order_index: 1,
    },
    {
      theme_id: themeId,
      title: 'Сети и протоколы',
      description: 'TCP/IP, DNS, HTTP/HTTPS, порты, firewalls — минимум для DevOps.',
      resource_url: 'https://developer.mozilla.org/ru/docs/Web/HTTP/Overview',
      order_index: 2,
    },
    {
      theme_id: themeId,
      title: 'Git и работа с репозиториями',
      description: 'Ветки, merge/rebase, pull requests, git flow.',
      resource_url: 'https://git-scm.com/book/ru/v2',
      order_index: 3,
    },
    {
      theme_id: themeId,
      title: 'Docker: контейнеризация',
      description: 'Образы, контейнеры, Dockerfile, тома, сети. Практика: контейнеризировать это приложение.',
      resource_url: 'https://docs.docker.com/get-started/',
      order_index: 4,
    },
  ]);
};
