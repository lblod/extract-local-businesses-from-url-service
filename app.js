import { app, query, errorHandler } from 'mu';
import rdfDereferencer from "rdf-dereference";

import { PathFactory } from 'ldflex';
import ComunicaEngine from '@ldflex/comunica';
import { namedNode } from '@rdfjs/data-model';

app.get('/triples', async function( req, res ) {
  if( !req.query.url ) {
    res
      .status(500)
      .send( JSON.stringify({ status: 400, message: "url query param not found in request" }));
    return;
  }
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

app.get('/business', async function( req, res ) {
  if( !req.query.url ) {
    res
      .status(500)
      .send( JSON.stringify({ status: 400, message: "url query param not found in request" }) );
    return;
  }
  try {
    const URL = req.query.url;

    const context = {
      "@context": {
        "@vocab": "http://schema.org/"
      }
    };

    const queryEngine = new ComunicaEngine( URL, { headers: { "Accept": "text/html" } } );

    const businesses = [];
    const allBusinessQ = queryEngine.execute(`SELECT ?business WHERE { ?business a <http://schema.org/LocalBusiness>. }` );

    /**
     * Create a single business instance by querying the store.
     *
     * @param uri [NamedNode] A NamedNode containing the business
     * subject URI.
     * @return A simple result object with a business description
     */
    const createBusinessInstance = async function( uri ) {
      const result = {};

      const path = new PathFactory({ context, queryEngine });
      const business = path.create({ subject: uri });

      result.name = await business.name;
      result.name = result.name ? result.name.value : result.name;
      result.description = await business.description;
      result.description = result.description ? result.description.value : result.description;
      result.url = await business.url;
      result.url = result.url ? result.url.value : result.url;
      result.email = await business.email;
      result.email = result.email ? result.email.value : result.email;
      result.telephone = await business.telephone;
      result.telephone = result.telephone ? result.telephone.value : result.telephone;

      return result;
    };

    for await (const bindings of allBusinessQ) {
      const uri = bindings.get("?business");
      businesses.push(
        await createBusinessInstance( uri )
      );
    }

    res
      .status(200)
      .send( JSON.stringify( businesses ) );
  } catch (error) {
    console.error("Something went wrong while processing request", error);
    res
      .status(500)
      .send( JSON.stringify({ status: 200, message: "Something went wrong while calculating the business" }) );
  }
});

app.use(errorHandler);
