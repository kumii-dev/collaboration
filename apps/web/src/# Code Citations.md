# Code Citations

## License: unknown
https://github.com/1mku/notes-app/blob/fa8d1f41d6650ac142ac84216b239e91a5f9415f/src/auth/AuthSessionContext.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/ktn1234/noted/blob/6318a2ed0e578ae23dfd613a9ec2de3aaf1e2b00/src/contexts/AuthContext.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/Griffy92/Pocket-Palette/blob/716d2dffd732fd868c7d3caba21c9191c8de7c63/src/App.jsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/springerjanek/studify/blob/2c887494434b6109eec235c557c99f90cec6bee2/src/app/shared/utils/auth.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/luckytasters0h/pineman-telegram-chat-server-application/blob/bc79be1969357b1e2d221271db09d19a30fc83c7/app/login/page.js

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/Griffy92/Pocket-Palette/blob/716d2dffd732fd868c7d3caba21c9191c8de7c63/src/App.jsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/springerjanek/studify/blob/2c887494434b6109eec235c557c99f90cec6bee2/src/app/shared/utils/auth.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/luckytasters0h/pineman-telegram-chat-server-application/blob/bc79be1969357b1e2d221271db09d19a30fc83c7/app/login/page.js

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/1mku/notes-app/blob/fa8d1f41d6650ac142ac84216b239e91a5f9415f/src/auth/AuthSessionContext.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/ktn1234/noted/blob/6318a2ed0e578ae23dfd613a9ec2de3aaf1e2b00/src/contexts/AuthContext.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/luckytasters0h/pineman-telegram-chat-server-application/blob/bc79be1969357b1e2d221271db09d19a30fc83c7/app/login/page.js

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/1mku/notes-app/blob/fa8d1f41d6650ac142ac84216b239e91a5f9415f/src/auth/AuthSessionContext.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/ktn1234/noted/blob/6318a2ed0e578ae23dfd613a9ec2de3aaf1e2b00/src/contexts/AuthContext.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/Griffy92/Pocket-Palette/blob/716d2dffd732fd868c7d3caba21c9191c8de7c63/src/App.jsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/springerjanek/studify/blob/2c887494434b6109eec235c557c99f90cec6bee2/src/app/shared/utils/auth.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/luckytasters0h/pineman-telegram-chat-server-application/blob/bc79be1969357b1e2d221271db09d19a30fc83c7/app/login/page.js

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/1mku/notes-app/blob/fa8d1f41d6650ac142ac84216b239e91a5f9415f/src/auth/AuthSessionContext.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/ktn1234/noted/blob/6318a2ed0e578ae23dfd613a9ec2de3aaf1e2b00/src/contexts/AuthContext.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/Griffy92/Pocket-Palette/blob/716d2dffd732fd868c7d3caba21c9191c8de7c63/src/App.jsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```


## License: unknown
https://github.com/springerjanek/studify/blob/2c887494434b6109eec235c557c99f90cec6bee2/src/app/shared/utils/auth.tsx

```
{
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (
```

