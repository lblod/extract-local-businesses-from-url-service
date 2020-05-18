import { app, query, errorHandler } from 'mu';
import rdfDereferencer from "rdf-dereference";

app.get('/', async function( req, res ) {
  const URL = req.query.url;
  try {
    let quadArray = [];
    const response = await rdfDereferencer.dereference( URL, { headers: { "Accept": "text/html" } } );

    await new Promise((success,failure) => {
      response
        .quads
        .on("data", (quad) => quadArray.push(quad) )
        .on("error", (message) => {
          console.warn(`Failed to pass through url ${URL}`);
          failure(message);
        })
        .on("end", () => {
          success( quadArray );
        });
    });
    res
      .status(200)
      .send(JSON.stringify( quadArray ));

  } catch (e) {
    console.error(`Error occurred calculating response for url ${URL}`);
    res
      .status(500)
      .send(JSON.stringify({ status: 500, message: "Something went wrong while getting the URL dereferenced." }));
  }
} );

app.use(errorHandler);
