async function getAllPages(request) {
    const paginatedResponse = await request;

    let currentResponse = paginatedResponse;

    while (currentResponse.next) {
        currentResponse = await spotifyApi.getGeneric(currentResponse.next);
        paginatedResponse.items = paginatedResponse.items.concat(currentResponse.items);
    }

    return paginatedResponse;
}

function redirectToLogin() {
    window.location.href = 'https://accounts.spotify.com/authorize?client_id=8bf1d78c0a4e44aaa611730d9caf856c&response_type=token&redirect_uri=http%3A%2F%2Flocalhost%3A8000%2F&scope=user-follow-read'
}

function isLoggedIn() {
    
}

const spotifyApi = new SpotifyWebApi();
const accessToken = "BQDqRlWwaHmhPzlyrz3tq75i_PBPEjsD9MaLpJ-ZP8tYg4PNscIuPUfSUgYjSugunzaroDAfTNihSwcYuQv6AtPXtsbckuM6yEjnUCowULpl21gjgXGb3VmPxulY7nY7XNVolw0HOPI0R7LAMLKaO-56eXLXQfpOjOtLMX7PWAEwEvezIZ94UjFPeGCWfdGFxsmJPm85Ws1xCW1QttARRUM3em7La2u_dkqqOoSzqn63FjhRQBsjl-BFzoNCucv0s6Vu29hHGLSM4BswDyFnHEezyG479kysuqsM9VlrPEM0AaLKDugS4BxcjX7-";

async function fetchSpotifyGuestAccessToken() {
    return (await (await fetch("https://spotify-guest-token.herokuapp.com/get_access_token")).json()).accessToken
}

// const guestAccessToken = await fetchSpotifyGuestAccessToken()

spotifyApi.setAccessToken(accessToken);


