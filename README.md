# atlas-recursive-auth

Ensures requests from CLI tool are using up-to-date credentials by re-prompting user for credentials when authorization is lost.

---

## install

```
npm install --save atlas-recursive-auth
```

## why

I was writing a small CLI tool for quickly converting my npm packages into Github repositories, and I realized that my CLI tool would have to do the following meta-things:

  1. Enter my username and password into a prompt.
  2. Use the username and password to get a personal access token from Github.
     - On an auth failure, go back to step 1 (hence, recursive).
  3. Store the token in a cache on my machine.
  4. Retrieve the token from my persistent cache.
  5. Use the token to do what my CLI tool is *actually* supposed to do.

My room is already super messy at this point, and I like to keep it clean. Most of this logic has nothing to do with my business logic, so it'd be nice if I could abstract it away into a different package.

## examples

For these examples, let's assume we have some sort of Reddit client and we're trying to establish long-term authentication. Let's also assume Reddit supports developer tokens. In theory, this will work with any website or service which lets you login and it doesn't even need to support developer tokens, since *you* write your own `clearAuth` and `getAuth` functions. You could just let the cache store your username and password, but it's recommended to use tokens if the service supports them.

#### required settings

You'll always need to specify a `name`, a `clearAuth` function and a `getAuth` function. The `name` acts as a namespace for the cache for the current application. The `clearAuth` function tells the authorizer how to delete access to the service, whereas the `getAuth` function tells the authorizer how to give you access to the service. It's pretty simple -- let's look at an example:

```javascript
const Authorizer = require("atlas-recursive-auth");
const authorizer = new Authorizer({
  name: "my-app",
  clearAuth: ({username, password}, cache, cb) => {
    // useAuth just sets query params or headers
    reddit.useAuth("password", username, password)
    reddit.deleteToken(cache.token, (err, res) => {
      // return null to signify auth error, else return err
      if (err) return cb(err.code === 403 ? null : err)
      // otherwise, tell authorizer to erase token from cache
      cb(null, ["token"])
    })
  },
  getAuth: ({username, password}, cache, cb) => {
    reddit.useAuth("password", username, password)
    reddit.createToken((err, res) => {
      // return null to signify auth error, else return err
      if (err) return cb(err.code === 403 ? null : err)
      // otherwise, give our client auth and tell authorizer to set cache
      reddit.useAuth("token", res.token)
      cb(null, {token: res.token})
    })
  }
})
```

#### optional settings

You might be wondering how the `clearAuth` and `getAuth` function obtain your username and password. The authorizer will prompt you for input when it's required. You can specify exactly what the prompt should ask for, using the format in the prompt package:

```javascript
...
const authorizer = new Authorizer({
  ...
  props: {
    username: {message: "Enter Reddit username"},
    password: {message: "Enter Reddit password", hidden: true}
  }
})
```

If you don't specify `props` in settings, it will default to:

```javascript
{
  username: {message: "Enter username"},
  password: {message: "Enter password", hidden: true}
}
```

### low-level api

Now that we've instantiated our authorizer, we can wrap requests with the `ensure` method. The `ensure` method makes sure that the code inside of it is re-run with new credentials if it doesn't have valid credentials. This API can be used directly if you need more control over error handling, but I would suggest using the provider API instead, since it's way simpler.

```javascript
...
const keepBeggingForCredsUntilWeGotPosts = cb => {
  authorizer.ensure((cache, onAuthFailure) => {
    // if you set the token on your client in getAuth
    // you don't need to use the cache here.
    reddit.useAuth("token", cache.token)
    reddit.getPrivatePosts((err, res) => {
      if (err) return err.code === 403 ? onAuthFailure(cb) : cb(err)
      cb(null, res.posts) // success!
    })
  })
}

keepBeggingForCredsUntilWeGotPosts((err, posts) => {
  if (err) console.log("something went wrong...");
  console.log(posts)
})
```

### provider api

The provider API is thinner than the API above. Often, you will want auth errors to be handled similarly, so the provider API lets you inline-wrap calls that need to be authenticated. All you need to do is provide a single error callback.

```javascript
...
const auth = authorizer.createProvider(err => {
  console.log("something went wrong...")
})
auth(reddit.getPrivatePosts)(posts => {
  console.log(posts)
})
```

Obviously, this is a lot cleaner and is preferred to using `ensure` directly, especially when you have many requests which need up-to-date authentication.

#### nesting wrapped requests

The same provider can be used to wrap any number of requests. You can even nest various requests and you will automatically be re-prompted for credentials if you happen to lose authorization in one of the blocks:

```javascript
...
auth(reddit.getPrivatePosts)(posts => {
  // if the next request fails to authorize (e.g. token expired),
  // it will re-prompt you for creds and rerun only that req
  auth(reddit.getPostAnalytics)(posts[0], stats => {
    console.log(posts[0], stats)
  })
})
```

If you play with react or blaze, you can compare it to a component re-rendering only the nested component when some data changes inside of the nested component. The main difference is that "rendering" here means "ask the user for credentials, then get a valid token and try again".

#### using a cache store

Sometimes, you will want to keep a reference to the most recent token/metadata that is being used to authenticate your requests:

```javascript
...
const store = {};
const auth = authorizer.createProvider(store, err => {
  console.log("something went wrong...")
})
```

Two auth providers can share the same store, and the store can be used to always have a reference to the underlying cached data, which will be available in `store.config`.

#### ignoring responses

The callback passed when invoking the provider is entirely optional (the error callback is still required):

```javascript
...
auth(reddit.setChatStatus)("offline") // no callback
```

## caveats

The following shouldn't be necessary if your requests are already using the cache's token/creds and setting the appropriate query params or headers themselves (e.g. with something like `useAuth` in the examples above). If you're relying on `getAuth` to set your client's token/creds, the following will be required.

#### prepare your client with the cached token/creds

On the very first authorized request your app makes, it will prompt you for credentials even if you have a valid token in the cache. The fix is pretty simple. Before your app starts making authorized requests, manually set the current token that's in the cache, if it exists:

```javascript
...
const cache = authorizer.getConfig();
if (cache.token){
  reddit.useAuth("token", cache.token)
}
const store = { config: cache };
const auth = authorizer.createProvider(store, err => {
  console.log("something went wrong...")
})
// write your business logic using your provider 'auth'
```

This could be solved by requiring a `setAuth` function which takes care of setting your client's authorization, but I'd rather keep the API small and give the developer some more freedom.
